import { useCallback, useEffect, useRef } from 'react'
import { useLibrary, useSettings, useAudio } from '../contexts'
import { Track } from '../models'
import type { TrackDTO, FolderNode } from '../services/types'
import type { DataEvent } from '../data/DataSource'
import { useData } from '../data'

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

function buildFolderTree (rootPaths: string[], files: string[]): FolderEntry[] {
  const nodes: FolderEntry[] = []

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

    function buildNode (nodePath: string, isRoot: boolean): FolderEntry {
      const childPaths = childrenMap.get(nodePath) ?? []
      const name = nodePath.split(/[/\\]/).pop() || nodePath
      return FolderEntry.fromFolderNode({
        id:       generateId(),
        name,
        path:     nodePath,
        children: childPaths.map(p =>
          buildNode(p, false)),
        expanded: isRoot,
      })
    }

    nodes.push(buildNode(rootPath, true))
  }

  return nodes
}


export function useLibraryScanner () {
  const { setFolders, setTracks, setLoading } = useLibrary()
  const { libraryPaths } = useSettings()
  const { play } = useAudio()
  const data = useData()

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

    const unsubscribe = data.subscribe((event: DataEvent) => {
      if (event.type === 'batch') {
        batchCount++

        for (const t of event.tracks as TrackDTO[])
          trackMap.current.set(t.id, Track.fromDTO(t))
        log.debug(`⇘ batch #${batchCount} — ${event.tracks.length} tracks (map size: ${trackMap.current.size})`)
        setTracks([ ...trackMap.current.values() ].sort((a, b) =>
          a.title.localeCompare(b.title)))
        setLoading(true)
      } else if (event.type === 'done') {
        const allTracks = [ ...trackMap.current.values() ]
        const folderData = buildFolderTree(libraryPathsRef.current as string[], allTracks.map(t =>
          t.path))
        log.info(`✓ scan done — ${allTracks.length} tracks · ${folderData.length} root(s) · ◴ ${Date.now() - t0}ms`)
        setFolders(folderData)
        setLoading(false)
      } else if (event.type === 'error') {
        console.error('[useLibraryScanner] scan error:', (event as { message: string }).message)
        setLoading(false)
      }
    })

    return () => {
      log.info('⊖ unsubscribing from library events')
      unsubscribe()
    }
  }, [ data ])

  // DB hydration — runs once on mount for instant startup
  useEffect(() => {
    data.load().then((tracks: readonly TrackDTO[]) => {
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
      .catch((err: unknown) =>
        console.error('[useLibraryScanner] DB load failed:', err))
  }, [ data ])

  const scanLibrary = useCallback(() => {
    if (libraryPaths.length === 0)
      return
    log.info(`⟲ scan triggered — paths: ${libraryPaths.join(', ')}`)
    trackMap.current.clear()
    setLoading(true)
    data.scan([ ...libraryPaths ])
  }, [ libraryPaths, setLoading, data ])

  const addAndScan = useCallback(async () =>
    await data.addRoot() ?? null, [])

  const playTrack = useCallback((track: Track) => {
    play(track)
  }, [ play ])

  return {
    scanLibrary,
    addAndScan,
    playTrack,
  }
}
