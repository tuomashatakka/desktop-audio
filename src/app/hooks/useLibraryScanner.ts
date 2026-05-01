import { useCallback, useEffect, useRef } from 'react'
import { useLibrary, useSettings, useAudio } from '../contexts'
import { Track } from '../models'
import type { TrackDTO, FolderNode } from '../services/types'
import { useBridge } from '../data'

// Track is already imported from '../models'
import { FolderEntry } from '../models'


const log = {
  info: (msg: string) =>
    console.log(`ⓘ [useLibraryScanner] ${msg}`),
  debug: (msg: string) =>
    console.log(`⌗ [useLibraryScanner] ${msg}`),
}

function generateId (): string {
  return Math.random().toString(36)
    .slice(2, 11)
}

function buildFolderTree (rootPaths: string[], files: string[]): { id: string; name: string; path: string; children: any[]; expanded: boolean }[] {
  const nodes: { id: string; name: string; path: string; children: any[]; expanded: boolean }[] = []

  for (const rootPath of rootPaths) {
    const rootFiles = files.filter(f =>
      f.startsWith(rootPath))
    const childrenMap = new Map<string, string[]>()

    for (const file of rootFiles) {
      const relative = file.slice(rootPath.length).replace(/^[\\/]/, '')
      const parts = relative.split(/[/\\]/)

      // eslint-disable-next-line functional/no-let
      let current = rootPath
      for (let i = 0; i < parts.length - 1; i++) {
        const parent = current
        current = current + '/' + parts[i]
        if (!childrenMap.has(parent))
          childrenMap.set(parent, [])

        const siblings = childrenMap.get(parent)!
        if (!siblings.includes(current))
          siblings.push(current)
      }
    }

    function buildNode (nodePath: string, isRoot: boolean): { id: string; name: string; path: string; children: any[]; expanded: boolean } {
      const childPaths = childrenMap.get(nodePath) ?? []
      const name = nodePath.split(/[/\\]/).pop() || nodePath
      return {
        id:       generateId(),
        name,
        path:     nodePath,
        children: childPaths.map(p =>
          buildNode(p, false)),
        expanded: isRoot,
      }
    }

    nodes.push(buildNode(rootPath, true))
  }

  return nodes
}


export function useLibraryScanner () {
  const { setFolders, setTracks, setLoading } = useLibrary()
  const { libraryPaths } = useSettings()
  const { play } = useAudio()
  const bridge = useBridge()

  const trackMap = useRef(new Map<string, Track>())
  const libraryPathsRef = useRef(libraryPaths)

  useEffect(() => {
    libraryPathsRef.current = libraryPaths
  }, [ libraryPaths ])

  // Subscribe to scan events once — persistent for lifetime of component
  useEffect(() => {
    log.info('⏻ subscribing to library events')

    // eslint-disable-next-line functional/no-let
    let batchCount = 0
    const t0 = Date.now()

    const unsubBatch = bridge.onLibraryBatch((batch: unknown[]) => {
      batchCount++

      for (const t of batch as TrackDTO[])
        trackMap.current.set(t.id, t as unknown as Track)
      log.debug(`⇘ batch #${batchCount} — ${batch.length} tracks (map size: ${trackMap.current.size})`)
      setTracks([ ...trackMap.current.values() ].sort((a, b) =>
        a.title.localeCompare(b.title)))
      setLoading(true)
    })
    const unsubDone = bridge.onLibraryDone(() => {
      const allTracks = [ ...trackMap.current.values() ]
      const folderData = buildFolderTree(libraryPathsRef.current as string[], allTracks.map(t =>
        t.path))
      log.info(`✓ scan done — ${allTracks.length} tracks · ${folderData.length} root(s) · ◴ ${Date.now() - t0}ms`)
      setFolders(folderData as any)
      setLoading(false)
    })
    return () => {
      log.info('⊖ unsubscribing from library events')
      unsubBatch()
      unsubDone()
    }
  }, [ bridge ])

  // DB hydration — runs once on mount for instant startup
  useEffect(() => {
    bridge.loadLibrary().then((tracks: readonly TrackDTO[]) => {
      if (tracks.length > 0) {
        log.info(`▤ DB hydrated — ${tracks.length} tracks`)
        for (const t of tracks)
          trackMap.current.set(t.id, Track.fromDTO(t))
        setTracks([ ...trackMap.current.values() ])
      }
      else {
        log.info('▤ DB empty (first run)')
      }
    })
      .catch(err =>
        console.error('[useLibraryScanner] DB load failed:', err))
  }, [ bridge ])

  const scanLibrary = useCallback(() => {
    if (libraryPaths.length === 0)
      return
    log.info(`⟲ scan triggered — paths: ${libraryPaths.join(', ')}`)
    trackMap.current.clear()
    setLoading(true)
    bridge.scanLibrary([ ...libraryPaths ])
  }, [ libraryPaths, setLoading, bridge ])

  const addAndScan = useCallback(async () =>
    await bridge.selectDirectory() ?? null, [])

  const playTrack = useCallback((track: Track) => {
    play(track)
  }, [ play ])

  return {
    scanLibrary,
    addAndScan,
    playTrack,
  }
}
