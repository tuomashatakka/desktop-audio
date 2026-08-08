/**
 * useLibraryScanner — hydrates the library from cache, then rescans in the
 * background.
 *
 * Two rules keep the list from flickering on every mount:
 *
 * 1. Hydration and the auto-scan are guarded by module-level keys, so
 *    remounting a view (switching tabs) never re-triggers them.
 * 2. A scan never clears the track map up front. Batches are merged in place
 *    over the cached rows, and only on `done` are the ids that this scan
 *    didn't see pruned — so the cached list stays on screen throughout.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLibrary, useSettings, useAudio } from '../contexts'
import { Track, FolderEntry } from '../models'
import type { TrackDTO } from '../services/types'
import type { DataEvent } from '../data/DataSource'
import { useData } from '../data'
import { generateId } from '../utils/generateId'


const log = {
  info: (msg: string) =>
    console.log(`ⓘ [useLibraryScanner] ${msg}`),
  debug: (msg: string) =>
    console.log(`⌗ [useLibraryScanner] ${msg}`),
}

function buildFolderTree (rootPaths: string[], files: string[]): FolderEntry[] {
  const nodes: FolderEntry[] = []

  for (const rootPath of rootPaths) {
    const rootFiles = files.filter(f =>
      f.startsWith(rootPath))
    const childrenMap = new Map<string, string[]>()

    for (const file of rootFiles) {
      const relative = file.slice(rootPath.length).replace(/^[\\/]/, '')
      const parts    = relative.split(/[/\\]/)

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
      const name       = nodePath.split(/[/\\]/).pop() || nodePath
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


/**
 * Cached tracks live outside React so a remount reuses them instead of
 * re-fetching. Same for the "already did this" guards below.
 */
const trackCache = new Map<string, Track>()

let hydrated                      = false
let lastScannedKey: string | null = null
let initialLoadResolved           = false

function byTitle (a: Track, b: Track): number {
  return a.title.localeCompare(b.title)
}

export function useLibraryScanner () {
  const { setFolders, setTracks, setLoading } = useLibrary()
  const { libraryPaths }                      = useSettings()
  const { play }                              = useAudio()
  const data                                  = useData()

  const trackMap = useRef(trackCache)

  /** Ids seen during the in-flight scan; empty when no scan is running. */
  const seenThisScan    = useRef(new Set<string>())
  const libraryPathsRef = useRef(libraryPaths)

  /** True until hydration or the first scan resolves — whichever comes first. */
  const [ isInitialLoading, setIsInitialLoading ] = useState(!initialLoadResolved)

  const markInitialResolved = useCallback(() => {
    if (initialLoadResolved)
      return
    initialLoadResolved = true
    setIsInitialLoading(false)
  }, [])

  useEffect(() => {
    libraryPathsRef.current = libraryPaths
  }, [ libraryPaths ])

  const publish = useCallback(() => {
    setTracks([ ...trackMap.current.values() ].sort(byTitle))
  }, [ setTracks ])

  /**
   * Rebuild the sidebar tree from whatever is in the cache. Called after
   * hydration too, not just on scan `done` — otherwise a cold start that
   * never rescans (unchanged roots) leaves the sidebar empty.
   */
  const publishFolders = useCallback(() => {
    const paths = [ ...trackMap.current.values() ].map(t =>
      t.path)
    if (paths.length === 0)
      return
    setFolders(buildFolderTree(libraryPathsRef.current as string[], paths))
  }, [ setFolders ])

  /** Merges a batch of DTOs into the cache; returns how many arrived. */
  const mergeTracks = useCallback((tracks: readonly TrackDTO[]): number => {
    for (const t of tracks)
      trackMap.current.set(t.id, Track.fromDTO(t))
    return tracks.length
  }, [])

  // Subscribe to scan and hydrate events once — persistent for lifetime of
  // component.
  useEffect(() => {
    log.info('⏻ subscribing to library events')

    let batchCount   = 0
    let hydrateCount = 0
    const t0 = Date.now()

    const subscription = data.subscribe((event: DataEvent) => {
      // Hydrate batches stream the persisted library in. They deliberately do
      // not touch `seenThisScan`: that set is the *scan's* prune bookkeeping,
      // and a concurrent scan's `done` must not treat a hydrated row as
      // rediscovered.
      if (event.type === 'hydrate-batch') {
        hydrateCount++
        mergeTracks(event.tracks as TrackDTO[])
        log.debug(`▤ hydrate batch #${hydrateCount} — ${event.tracks.length} tracks (map size: ${trackMap.current.size})`)
        publish()
        // Rows are on screen; there is nothing left for a spinner to wait on.
        markInitialResolved()
      }
      else if (event.type === 'hydrate-done') {
        log.info(`▤ DB hydrated — ${trackMap.current.size} tracks · ◴ ${Date.now() - t0}ms`)
        publishFolders()
        markInitialResolved()
      }
      else if (event.type === 'batch') {
        batchCount++

        mergeTracks(event.tracks as TrackDTO[])
        for (const t of event.tracks as TrackDTO[])
          seenThisScan.current.add(t.id)

        log.debug(`⇘ batch #${batchCount} — ${event.tracks.length} tracks (map size: ${trackMap.current.size})`)
        publish()
        setLoading(true)
      }
      else if (event.type === 'done') {
        // Prune rows the scan didn't rediscover — but only if it actually
        // found something, so a failed scan can't wipe the cache.
        if (seenThisScan.current.size > 0)
          for (const id of [ ...trackMap.current.keys() ])
            if (!seenThisScan.current.has(id))
              trackMap.current.delete(id)
        seenThisScan.current.clear()

        log.info(`✓ scan done — ${trackMap.current.size} tracks · ◴ ${Date.now() - t0}ms`)
        publish()
        publishFolders()
        setLoading(false)
        markInitialResolved()
      }
      else if (event.type === 'error') {
        console.error('[useLibraryScanner] scan error:', (event as { message: string }).message)
        seenThisScan.current.clear()
        setLoading(false)
        markInitialResolved()
      }
    })

    return () => {
      log.info('⊖ unsubscribing from library events')
      subscription.dispose()
    }
  }, [ data, mergeTracks, publish, publishFolders, setLoading, markInitialResolved ])

  // Cache hydration — replay what we already have, then ask for the DB once.
  //
  // `data.load()` is fire-and-forget: rows come back as `hydrate-batch`
  // events handled above, so the renderer paints while the read is still
  // running instead of waiting on one big array. A first run with an empty
  // DB simply yields `hydrate-done` with nothing, and `isInitialLoading`
  // stays up for the auto-rescan below (or the empty-state card preempts it).
  useEffect(() => {
    if (trackMap.current.size > 0) {
      publish()
      publishFolders()
    }

    if (hydrated)
      return
    hydrated = true

    data.load()
  }, [ data, publish, publishFolders ])

  const scanLibrary = useCallback(() => {
    if (libraryPaths.length === 0)
      return
    log.info(`⟲ scan triggered — paths: ${libraryPaths.join(', ')}`)
    seenThisScan.current = new Set()
    setLoading(true)
    data.scan([ ...libraryPaths ])
  }, [ libraryPaths, setLoading, data ])

  // Background rescan — once per distinct set of roots, not once per mount.
  useEffect(() => {
    const key = [ ...libraryPaths ].sort()
      .join(' ')
    if (!key || key === lastScannedKey)
      return
    lastScannedKey = key
    scanLibrary()
  }, [ libraryPaths, scanLibrary ])

  const addAndScan = useCallback(async () =>
    await data.addRoot() ?? null, [ data ])

  const playTrack = useCallback((track: Track) => {
    play(track)
  }, [ play ])

  return {
    scanLibrary,
    addAndScan,
    playTrack,
    isInitialLoading,
  }
}
