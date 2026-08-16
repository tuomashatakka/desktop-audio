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
import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useLibrary, useSettings, useAudio } from '../contexts'
import { Track, FolderEntry } from '../models'
import type { TrackDTO } from '../services/types'
import type { DataEvent } from '../data/DataSource'
import { useData } from '../data'
import { generateId } from '../utils/generateId'
import { isUnderRoots, removedRoots } from '../utils/roots'


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

let hydrated                            = false
let lastRoots: readonly string[] | null = null
let initialLoadResolved                 = false

interface ScheduledTask {
  readonly kind: 'frame' | 'idle' | 'timeout'
  readonly id:   number
}

export function useLibraryScanner () {
  const { setFolders, setTracks, setLoading } = useLibrary()
  const { libraryPaths, ready }               = useSettings()
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

  // The latest-value mirror the subscription below reads. Assigned here rather
  // than from an effect: it is only ever read from a callback, never during
  // render, so all it has to be is current by the time one of them runs.
  libraryPathsRef.current = libraryPaths

  const publishTask = useRef<ScheduledTask | null>(null)

  /**
   * Commit one immutable snapshot as non-urgent work.
   *
   * The table owns sorting already, so sorting the same 6000 rows here before
   * every streamed commit only blocked the renderer twice. The array copy is
   * linear and the React render is interruptible by clicks, typing and scroll.
   */
  const publish = useCallback(() => {
    const tracks          = [ ...trackMap.current.values() ]
    const resolvesInitial = !initialLoadResolved

    if (resolvesInitial)
      initialLoadResolved = true

    startTransition(() => {
      setTracks(tracks)
      if (resolvesInitial)
        setIsInitialLoading(false)
    })
  }, [ setTracks ])

  const cancelScheduledPublish = useCallback(() => {
    const task = publishTask.current
    if (!task)
      return

    if (task.kind === 'frame')
      cancelAnimationFrame(task.id)
    else
      clearTimeout(task.id)

    publishTask.current = null
  }, [])

  /**
   * Coalescing has to be per *frame*, not per microtask: every batch arrives
   * as its own IPC event, so a microtask queue drains between them and would
   * collapse nothing. A frame is also the finest granularity anyone can see.
   */
  const schedulePublish = useCallback(() => {
    if (publishTask.current)
      return

    const run = () => {
      publishTask.current = null
      publish()
    }

    publishTask.current = typeof requestAnimationFrame === 'function'
      ? { kind: 'frame', id: requestAnimationFrame(run) }
      : { kind: 'timeout', id: setTimeout(run, 16) as unknown as number }
  }, [ publish ])

  /** Publish now and truly cancel the pending frame, avoiding a duplicate commit. */
  const publishNow = useCallback(() => {
    cancelScheduledPublish()
    publish()
  }, [ cancelScheduledPublish, publish ])

  /**
   * Rebuild the sidebar tree from whatever is in the cache. Called after
   * hydration too, not just on scan `done` — otherwise a cold start that
   * never rescans (unchanged roots) leaves the sidebar empty.
   */
  const folderTask = useRef<ScheduledTask | null>(null)

  const cancelScheduledFolders = useCallback(() => {
    const task = folderTask.current
    if (!task)
      return

    if (task.kind === 'idle')
      cancelIdleCallback(task.id)
    else
      clearTimeout(task.id)

    folderTask.current = null
  }, [])

  /**
   * Folder derivation is terminal bookkeeping, not input-critical work. Build
   * it in an idle task and commit it as a transition so a large path set never
   * steals time from scrolling or playback controls.
   */
  const scheduleFolders = useCallback(() => {
    cancelScheduledFolders()

    const run = () => {
      folderTask.current = null

      const paths        = [ ...trackMap.current.values() ].map(track =>
        track.path)
      const folders       = paths.length === 0
        ? []
        : buildFolderTree(libraryPathsRef.current as string[], paths)

      startTransition(() =>
        setFolders(folders))
    }

    folderTask.current = typeof requestIdleCallback === 'function'
      ? { kind: 'idle', id: requestIdleCallback(run, { timeout: 250 }) }
      : { kind: 'timeout', id: setTimeout(run, 0) as unknown as number }
  }, [ cancelScheduledFolders, setFolders ])

  /** Merges a batch of DTOs into the cache; returns how many arrived. */
  const mergeTracks = useCallback((tracks: readonly TrackDTO[]): number => {
    for (const t of tracks)
      trackMap.current.set(t.id, Track.fromDTO(t))
    return tracks.length
  }, [])

  /**
   * Discard whatever the configured roots no longer cover.
   *
   * Removing a root now cleans up after itself, but rows stranded by removals
   * that happened *before* that was true are only discoverable here, once the
   * database has been read back. Named ids go to the writer rather than a
   * "delete everything outside the roots" statement, so the worst a bug here
   * can do is name too few.
   *
   * Safe only because `data.load()` waits for settings to hydrate — see the
   * hydration effect below.
   */
  const reconcileToRoots = useCallback(() => {
    const roots             = libraryPathsRef.current as string[]
    const orphans: string[] = []

    for (const [ id, track ] of trackMap.current)
      if (!isUnderRoots(track.path, roots))
        orphans.push(id)

    if (orphans.length === 0)
      return

    // Configured roots that match *nothing* are not roots the user emptied,
    // they are roots expressed in a different vocabulary than the paths. The
    // browser data source is exactly that: its `libraryPaths` are generated
    // root ids while its track paths start with the folder's label, so a
    // literal reading here would discard the whole library. No roots at all is
    // a different thing and stays a real answer — everything *is* an orphan.
    if (roots.length > 0 && orphans.length === trackMap.current.size) {
      log.info('⊖ every track sits outside the configured roots — treating that as a mismatch, not a removal')
      return
    }

    log.info(`⊖ discarding ${orphans.length} track(s) outside the configured roots`)
    for (const id of orphans)
      trackMap.current.delete(id)

    void data.forgetTracks(orphans)
  }, [ data ])

  // Subscribe to scan and hydrate events once — persistent for lifetime of
  // component.
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Subscribes to the library event stream. Nothing here returns a library — a scan and a hydrate both arrive only as events.
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
        schedulePublish()
      }
      else if (event.type === 'hydrate-done') {
        log.info(`▤ DB hydrated — ${trackMap.current.size} tracks · ◴ ${Date.now() - t0}ms`)
        reconcileToRoots()
        publishNow()
        scheduleFolders()
        markInitialResolved()
      }
      else if (event.type === 'batch') {
        batchCount++

        mergeTracks(event.tracks as TrackDTO[])
        for (const t of event.tracks as TrackDTO[])
          seenThisScan.current.add(t.id)

        log.debug(`⇘ batch #${batchCount} — ${event.tracks.length} tracks (map size: ${trackMap.current.size})`)
        schedulePublish()
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
        publishNow()
        scheduleFolders()
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
      cancelScheduledPublish()
      cancelScheduledFolders()
    }
  }, [ data, mergeTracks, schedulePublish, publishNow, scheduleFolders, reconcileToRoots, setLoading, markInitialResolved, cancelScheduledPublish, cancelScheduledFolders ])

  // Cache hydration — replay what we already have, then ask for the DB once.
  //
  // `data.load()` is fire-and-forget: rows come back as `hydrate-batch`
  // events handled above, so the renderer paints while the read is still
  // running instead of waiting on one big array. A first run with an empty
  // DB simply yields `hydrate-done` with nothing, and `isInitialLoading`
  // stays up for the auto-rescan below (or the empty-state card preempts it).
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Replays the module-level cache on mount and fires the one-time hydrate.
  useEffect(() => {
    if (trackMap.current.size > 0) {
      publish()
      scheduleFolders()
    }

    // Gated on settings: the reconciliation below decides what to discard from
    // `libraryPaths`, and the tree is built from it too. Hydrating first would
    // mean doing both against the defaults.
    if (hydrated || !ready)
      return
    hydrated = true

    data.load()
  }, [ data, ready, publish, scheduleFolders ])

  const scanLibrary = useCallback(() => {
    if (libraryPaths.length === 0)
      return
    log.info(`⟲ scan triggered — paths: ${libraryPaths.join(', ')}`)
    seenThisScan.current = new Set()
    setLoading(true)
    data.scan([ ...libraryPaths ])
  }, [ libraryPaths, setLoading, data ])

  /**
   * Discard a removed root's tracks — from the cache now, from SQLite for good.
   *
   * Neither happened before. The scanner's prune only reaches inside the roots
   * it was asked to scan, so a de-registered folder's rows outlived every later
   * scan and came back on the next hydrate; and when the *last* root went the
   * rescan did not run at all, so even the cache kept them.
   */
  const forget = useCallback((roots: readonly string[]) => {
    log.info(`⊖ forgetting ${roots.length} removed root(s): ${roots.join(', ')}`)

    for (const [ id, track ] of trackMap.current)
      if (isUnderRoots(track.path, roots))
        trackMap.current.delete(id)

    publishNow()
    scheduleFolders()
    void data.forgetRoots(roots)
  }, [ data, publishNow, scheduleFolders ])

  // Background rescan — once per distinct set of roots, not once per mount.
  //
  // The previous roots are kept rather than a joined key, because what a root
  // *disappearing* means is not derivable from a key comparison. Waiting for
  // `ready` is what makes that safe *and* honest: this hook's effects run
  // before its provider's, so without it the first pass saw the placeholder
  // defaults — scanning a folder called `Music` that does not exist, and then
  // reading the real settings arriving as if the user had removed it.
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Reacts to the configured library paths changing: forgets removed roots and starts a scan.
  useEffect(() => {
    if (!ready)
      return

    const roots = [ ...libraryPaths ].sort()
    if (lastRoots && roots.join(' ') === lastRoots.join(' '))
      return

    const removed = removedRoots(lastRoots, roots)
    lastRoots     = roots

    if (removed.length > 0)
      forget(removed)

    // Nothing left to scan is a valid state, not a reason to skip the work
    // above — `forget` has already emptied the list and the tree.
    if (roots.length > 0)
      scanLibrary()
  }, [ libraryPaths, ready, scanLibrary, forget ])

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
