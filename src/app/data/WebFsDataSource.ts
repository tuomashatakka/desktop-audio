import { Disposable } from 'disposable-events'
import type { DataSource, DataEvent, DataListener, LibraryRoot, AudioMetadata, TrackDTO } from './DataSource'
import { idbGet, idbSet, idbDelete, idbGetAll } from './idb'
import { isUnderRoots } from '../utils/roots'


const AUDIO_EXTENSIONS = new Set([ '.mp3', '.flac', '.ogg', '.wav', '.m4a', '.opus' ])

/** Rows per hydrate event; matches `READ_BATCH_SIZE` in `db-reader.ts`. */
const HYDRATE_BATCH_SIZE = 200

/** Give Chromium a render opportunity between cache batches. */
const yieldToRenderer = async (): Promise<void> =>
  await new Promise(resolve =>
    setTimeout(resolve, 0))

type TrackSource =
  | { readonly kind: 'handle'; readonly handle: FileSystemFileHandle } |
  { readonly kind: 'file'; readonly file: File }

interface HandleRootEntry {
  readonly id:     string
  readonly label:  string
  readonly handle: FileSystemDirectoryHandle
  readonly kind?:  undefined
}

interface FilesRootEntry {
  readonly id:    string
  readonly label: string
  readonly kind:  'files'
}

type RootEntry = HandleRootEntry | FilesRootEntry

// Simple hash function for browser environment (Web Crypto API)
async function hashString (text: string): Promise<string> {
  const encoder    = new TextEncoder()
  const data       = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray  = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b =>
    b.toString(16).padStart(2, '0')).join('')
}

// Generate UUID v4 for browser environment
function generateUUID (): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    c => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : r & 0x3 | 0x8
      return v.toString(16)
    }
  )
}

// Async generator to walk directory tree (Chromium handle path)
async function* walkDir (handle: FileSystemDirectoryHandle, path = ''): AsyncGenerator<[string, FileSystemFileHandle]> {
  for await (const [ name, child ] of handle.entries()) {
    const childPath = path ? `${path}/${name}` : name
    if (child.kind === 'file')
      yield [ childPath, child as FileSystemFileHandle ]
    else if (child.kind === 'directory')
      yield* walkDir(child as FileSystemDirectoryHandle, childPath)
  }
}

// Firefox / Safari fallback: <input type="file" webkitdirectory>
function pickDirectoryFallback (): Promise<{ label: string; files: File[] } | null> {
  return new Promise(resolve => {
    const input    = document.createElement('input')
    input.type     = 'file'
    input.multiple = true;
    // webkitdirectory is non-standard but supported in Firefox, Safari, Chromium
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true
    input.style.display                                                        = 'none'

    // Promise resolution is idempotent by spec, so a second settle() (e.g. a
    // stray 'change' after 'cancel') is a harmless no-op — no latch needed.
    const settle = (value: { label: string; files: File[] } | null) => {
      input.remove()
      resolve(value)
    }

    input.addEventListener('change', () => {
      const fileList = input.files
      if (!fileList || fileList.length === 0) {
        settle(null)
        return
      }

      const files = Array.from(fileList)
      // First path segment of webkitRelativePath is the picked folder name
      const firstPath = files[0]?.webkitRelativePath ?? ''
      const label     = firstPath.split('/')[0] || 'Library'
      settle({ label, files })
    })

    // Browser fires `cancel` (Chromium 113+, Firefox 91+) when picker is dismissed
    input.addEventListener('cancel', () => {
      settle(null)
    })

    document.body.append(input)
    input.click()
  })
}

export class WebFsDataSource implements DataSource {
  private readonly listeners = new Set<DataListener>()
  private readonly trackSourceMap = new Map<string, TrackSource>()
  // Firefox path: File[] per rootId, kept in-memory only (handles aren't durable)
  private readonly rootFiles = new Map<string, File[]>()

  private setTrackSource (trackId: string, source: TrackSource): void {
    this.trackSourceMap.set(trackId, source)
  }

  private getTrackSource (trackId: string): TrackSource | undefined {
    return this.trackSourceMap.get(trackId)
  }

  static isPickerSupported (): boolean {
    if (typeof window === 'undefined')
      return false
    if ('showDirectoryPicker' in window)
      return true

    // webkitdirectory probe
    const probe = document.createElement('input')
    return 'webkitdirectory' in probe
  }

  async addRoot (): Promise<string | null> {
    try {
      if ('showDirectoryPicker' in window) {
        const handle = await (window as Window & typeof globalThis & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
        const rootId = generateUUID()
        const label  = handle.name
        await idbSet('roots', rootId, { id: rootId, label, handle } satisfies HandleRootEntry)
        return rootId
      }

      // Fallback for Firefox / Safari
      const picked = await pickDirectoryFallback()
      if (!picked)
        return null

      const rootId                = generateUUID()
      const entry: FilesRootEntry = { id: rootId, label: picked.label, kind: 'files' }
      await idbSet('roots', rootId, entry)
      this.rootFiles.set(rootId, picked.files)
      return rootId
    }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError')
        return null
      if (error instanceof DOMException && error.name === 'PermissionDeniedError')
        throw new Error('Permission denied to access directory')
      throw error
    }
  }

  async removeRoot (rootId: string): Promise<void> {
    await idbDelete('roots', rootId)
    this.rootFiles.delete(rootId)
  }

  async listRoots (): Promise<readonly LibraryRoot[]> {
    const roots = await idbGetAll('roots')
    return roots.map(
      (entry: unknown) => {
        const value = (entry as { value: RootEntry }).value
        return {
          id:    value.id,
          label: value.label
        }
      }
    )
  }

  async getMusicDir (): Promise<string | null> {
    return null
  }

  scan (rootIds: readonly string[]): void {
    this.performScan(rootIds).catch(
      error => {
        this.emit({ type: 'error', message: error.message })
      }
    )
  }

  /** In-memory Firefox/Safari root: files carry no relative-path structure of their own. */
  private async scanFilesRoot (
    rootId: string, value: FilesRootEntry, pushTrack: (track: TrackDTO) => Promise<void>
  ): Promise<void> {
    const files = this.rootFiles.get(rootId)
    if (!files || files.length === 0)
      return

    const rootPrefix = `${value.label}/`
    for (const file of files) {
      const ext = `.${(file.name.split('.').pop() ?? '').toLowerCase()}`
      if (!AUDIO_EXTENSIONS.has(ext))
        continue

      // webkitRelativePath: "<rootLabel>/sub/dir/file.mp3" — strip leading root
      const fullPath     = file.webkitRelativePath || file.name
      const relativePath = fullPath.startsWith(rootPrefix)
        ? fullPath.slice(rootPrefix.length)
        : fullPath

      const trackId = await hashString(rootId + relativePath)
      this.setTrackSource(trackId, { kind: 'file', file })

      await pushTrack({
        id:         trackId,
        path:       `${value.label}/${relativePath}`,
        title:      file.name.replace(/\.[^/.]+$/, ''),
        artist:     'Unknown Artist',
        album:      'Unknown Album',
        duration:   0,
        format:     ext.slice(1),
        size:       file.size,
        coverColor: `#${Math.floor(Math.random() * 16777215).toString(16)
          .padStart(6, '0')}`
      })
    }
  }

  /** Chromium root: a real `FileSystemDirectoryHandle` walked recursively. */
  private async scanHandleRoot (
    rootId: string, value: HandleRootEntry, pushTrack: (track: TrackDTO) => Promise<void>
  ): Promise<void> {
    const { handle: rootHandle, label } = value
    for await (const [ relativePath, fileHandle ] of walkDir(rootHandle)) {
      const ext = `.${(fileHandle.name.split('.').pop() ?? '').toLowerCase()}`
      if (!AUDIO_EXTENSIONS.has(ext))
        continue

      const trackId = await hashString(rootId + relativePath)
      this.setTrackSource(trackId, { kind: 'handle', handle: fileHandle })

      await pushTrack({
        id:         trackId,
        path:       `${label}/${relativePath}`,
        title:      fileHandle.name.replace(/\.[^/.]+$/, ''),
        artist:     'Unknown Artist',
        album:      'Unknown Album',
        duration:   0,
        format:     ext.slice(1),
        size:       0,
        coverColor: `#${Math.floor(Math.random() * 16777215).toString(16)
          .padStart(6, '0')}`
      })
    }
  }

  private async performScan (rootIds: readonly string[]): Promise<void> {
    const batchSize = 20
    const state     = { batch: [] as TrackDTO[], totalCount: 0 }

    const pushTrack = async (track: TrackDTO): Promise<void> => {
      state.batch.push(track)
      if (state.batch.length >= batchSize) {
        this.emit({ type: 'batch', tracks: [ ...state.batch ]})
        state.totalCount += state.batch.length
        state.batch = []
      }
    }

    for (const rootId of rootIds) {
      const rootEntry = await idbGet('roots', rootId)
      if (!rootEntry)
        continue

      const value = (rootEntry as { value: RootEntry }).value

      if (value.kind === 'files')
        await this.scanFilesRoot(rootId, value, pushTrack)
      else
        await this.scanHandleRoot(rootId, value, pushTrack)
    }

    if (state.batch.length > 0) {
      this.emit({ type: 'batch', tracks: [ ...state.batch ]})
      state.totalCount += state.batch.length
    }

    this.emit({ type: 'done', totalCount: state.totalCount })
  }

  /**
   * Streams the IndexedDB cache back as hydrate events, mirroring the Electron
   * host so `useLibraryScanner` has one code path for both.
   *
   * IndexedDB hands over everything at once. Mapping and emitting every chunk
   * in one promise callback still monopolises the renderer, so each batch is
   * materialised on demand and yields before the next one.
   */
  load (): void {
    void (async () => {
      const entries = await idbGetAll('tracks')

      for (let i = 0; i < entries.length; i += HYDRATE_BATCH_SIZE) {
        const tracks = entries
          .slice(i, i + HYDRATE_BATCH_SIZE)
          .map((entry: unknown) =>
            (entry as { value: TrackDTO }).value)

        this.emit({ type: 'hydrate-batch', tracks })

        if (i + HYDRATE_BATCH_SIZE < entries.length)
          await yieldToRenderer()
      }

      this.emit({ type: 'hydrate-done', totalCount: entries.length })
    })().catch((err: unknown) => {
      this.emit({ type: 'error', message: String(err) })
    })
  }

  /**
   * See {@link DataSource.forgetRoots}. The IndexedDB counterpart of the
   * writer thread's `DELETE`, matching on the same prefix rule.
   */
  async forgetRoots (roots: readonly string[]): Promise<void> {
    if (roots.length === 0)
      return

    const entries = await idbGetAll('tracks')
    const doomed  = entries
      .map((entry: unknown) =>
        (entry as { value: TrackDTO }).value)
      .filter(track =>
        isUnderRoots(track.path, roots))

    await Promise.all(doomed.map(track =>
      idbDelete('tracks', track.id)))
  }

  /** See {@link DataSource.forgetTracks}. */
  async forgetTracks (trackIds: readonly string[]): Promise<void> {
    await Promise.all(trackIds.map(id =>
      idbDelete('tracks', id)))
  }

  subscribe (l: DataListener): Disposable {
    this.listeners.add(l)
    return new Disposable(() => {
      this.listeners.delete(l)
    })
  }

  private emit (event: DataEvent): void {
    for (const listener of this.listeners)
      listener(event)
  }

  private async sourceToFile (source: TrackSource): Promise<File> {
    if (source.kind === 'file')
      return source.file
    return await source.handle.getFile()
  }

  async readBytes (trackId: string): Promise<ArrayBuffer> {
    const source = this.getTrackSource(trackId)
    if (!source)
      throw new Error(`No file source found for trackId: ${trackId}`)

    const file = await this.sourceToFile(source)
    return await file.arrayBuffer()
  }

  async readMetadata (trackId: string): Promise<AudioMetadata> {
    const source = this.getTrackSource(trackId)
    if (!source)
      throw new Error(`No file source found for trackId: ${trackId}`)

    const file = await this.sourceToFile(source)

    const mm       = await import('music-metadata')
    const metadata = await mm.parseBlob(file)

    return {
      title:       metadata.common.title,
      artist:      metadata.common.artist,
      album:       metadata.common.album,
      year:        metadata.common.year,
      genre:       metadata.common.genre?.[0],
      trackNumber: metadata.common.track?.no ?? undefined,
      duration:    metadata.format.duration ?? 0,
      format:      metadata.format.container?.toLowerCase(),
      bitrate:     metadata.format.bitrate,
      sampleRate:  metadata.format.sampleRate,
      channels:    metadata.format.numberOfChannels
    }
  }

  /**
   * The browser build keeps whole DTOs in IndexedDB rather than a column store,
   * so art was never split out of the row here — this just reads it back. The
   * `size` distinction is an Electron-side downscale and has no equivalent.
   */
  async readArtwork (trackId: string): Promise<string | null> {
    const track = await idbGet('tracks', trackId) as TrackDTO | undefined
    return track?.albumArt ?? null
  }

  async upsertTrack (track: TrackDTO): Promise<void> {
    await idbSet('tracks', track.id, track)
  }

  async deleteTrack (trackId: string): Promise<void> {
    await idbDelete('tracks', trackId)
    this.trackSourceMap.delete(trackId)
  }

  /**
   * Re-request permissions for stored handle-based roots and prune Firefox
   * (file-list) roots that cannot survive a reload. Called on first user gesture.
   */
  async init (): Promise<readonly string[]> {
    const rootEntries               = await idbGetAll('roots')
    const verifiedRootIds: string[] = []
    const firefoxRootsPruned        = rootEntries.filter(entry =>
      (entry as { value: RootEntry }).value.kind === 'files').length

    for (const entry of rootEntries) {
      const value = (entry as { value: RootEntry }).value

      if (value.kind === 'files') {
        // No durable handle — must be re-picked. Drop silently.
        await this.removeRoot(value.id)
        continue
      }

      if (!('showDirectoryPicker' in window)) {
        // Stored a handle in a previous session, but this browser can't use it.
        await this.removeRoot(value.id)
        continue
      }

      const { id, label, handle } = value
      try {
        const fh = handle as FileSystemDirectoryHandle & { queryPermission?: (options: { mode: string }) => Promise<PermissionState> }

        const queriedPermission = fh.queryPermission
          ? await fh.queryPermission({ mode: 'read' })
          : undefined
        const initialPermission: PermissionState = queriedPermission ?? 'prompt'

        const fr         = handle as FileSystemDirectoryHandle & { requestPermission?: (options: { mode: string }) => Promise<PermissionState> }
        const permission = initialPermission !== 'granted' && fr.requestPermission
          ? await fr.requestPermission({ mode: 'read' })
          : initialPermission

        if (permission === 'granted')
          verifiedRootIds.push(id)
        else {
          console.log(`WebFsDataSource: root "${label}" permission denied, removing`)
          await this.removeRoot(id)
        }
      }
      catch (error) {
        console.warn(`WebFsDataSource: failed to verify root "${label}":`, error)
        await this.removeRoot(id)
      }
    }

    if (firefoxRootsPruned > 0)
      console.info(`WebFsDataSource: pruned ${firefoxRootsPruned} folder(s) that need to be re-added (browser does not persist directory access).`)

    if (verifiedRootIds.length > 0)
      this.scan(verifiedRootIds)

    return verifiedRootIds
  }
}
