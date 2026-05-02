import type { DataSource, DataEvent, DataListener, LibraryRoot, AudioMetadata, TrackDTO } from './DataSource'
import { idbGet, idbSet, idbDelete, idbGetAll } from './idb'

const AUDIO_EXTENSIONS = new Set(['.mp3', '.flac', '.ogg', '.wav', '.m4a', '.opus'])

// Simple hash function for browser environment (Web Crypto API)
async function hashString(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate UUID v4 for browser environment
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    }
  )
}

// Async generator to walk directory tree
async function* walkDir(
  handle: FileSystemDirectoryHandle,
  path = ''
): AsyncGenerator<[string, FileSystemFileHandle]> {
  for await (const [name, child] of handle.entries()) {
    const childPath = path ? `${path}/${name}` : name
    if (child.kind === 'file') {
      yield [childPath, child as FileSystemFileHandle]
    } else if (child.kind === 'directory') {
      yield* walkDir(child as FileSystemDirectoryHandle, childPath)
    }
  }
}

export class WebFsDataSource implements DataSource {
  private readonly listeners = new Set<DataListener>()
  private readonly trackHandleMap = new Map<string, FileSystemFileHandle>()

  // Store mapping from trackId to file handle for quick access
  private setTrackHandle(trackId: string, handle: FileSystemFileHandle): void {
    this.trackHandleMap.set(trackId, handle)
  }

  private getTrackHandle(trackId: string): FileSystemFileHandle | undefined {
    return this.trackHandleMap.get(trackId)
  }

  async addRoot(): Promise<string | null> {
    try {
      // Type assertion for File System Access API (Chromium 86+)
      const handle = await (window as Window & typeof globalThis & { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
      const rootId = generateUUID()
      const label = handle.name

      // Store the handle in IndexedDB
      await idbSet('roots', rootId, { id: rootId, label, handle })

      return rootId
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // User cancelled the picker
        return null
      }
      if (error instanceof DOMException && error.name === 'PermissionDeniedError') {
        throw new Error('Permission denied to access directory')
      }
      throw error
    }
  }

  async removeRoot(rootId: string): Promise<void> {
    await idbDelete('roots', rootId)
  }

  async listRoots(): Promise<readonly LibraryRoot[]> {
    const roots = await idbGetAll('roots')
    return roots.map(
      (entry: unknown) => {
        const value = (entry as { value: { id: string; label: string } }).value
        return {
          id: value.id,
          label: value.label
        }
      }
    )
  }

  async getMusicDir(): Promise<string | null> {
    // Browser doesn't have access to default music dir
    // Could potentially check IndexedDB for a saved preference
    return null
  }

  scan(rootIds: readonly string[]): void {
    // Fire and forget - results stream via subscribe()
    this.performScan(rootIds).catch(
      (error) => {
        this.emit({ type: 'error', message: error.message })
      }
    )
  }

  private async performScan(rootIds: readonly string[]): Promise<void> {
    const batchSize = 20
    let batch: TrackDTO[] = []
    let totalCount = 0

    for (const rootId of rootIds) {
      const rootEntry = await idbGet('roots', rootId)
      if (!rootEntry) continue

      const { handle: rootHandle, label } = (rootEntry as { value: { handle: FileSystemDirectoryHandle; label: string } }).value

      for await (const [relativePath, fileHandle] of walkDir(rootHandle)) {
        // Check if file has audio extension
        const ext = `.${(fileHandle.name.split('.').pop() ?? '').toLowerCase()}`
        if (!AUDIO_EXTENSIONS.has(ext)) continue

        // Generate track ID from rootId + relativePath
        const trackId = await hashString(rootId + relativePath)

        // Store file handle for later access
        this.setTrackHandle(trackId, fileHandle)

        // Create TrackDTO
        const track: TrackDTO = {
          id: trackId,
          path: `${label}/${relativePath}`,
          title: fileHandle.name.replace(/\.[^/.]+$/, ''), // Remove extension
          artist: 'Unknown Artist',
          album: 'Unknown Album',
          duration: 0,
          format: ext.slice(1),
          size: 0,
          coverColor: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
        }

        batch.push(track)

        // Emit batch when we have 20 tracks
        if (batch.length >= batchSize) {
          this.emit({ type: 'batch', tracks: [...batch] })
          totalCount += batch.length
          batch = []
        }
      }
    }

    // Emit remaining tracks
    if (batch.length > 0) {
      this.emit({ type: 'batch', tracks: [...batch] })
      totalCount += batch.length
    }

    this.emit({ type: 'done', totalCount })
  }

  async load(): Promise<readonly TrackDTO[]> {
    const entries = await idbGetAll('tracks')
    return entries.map(
      (entry: unknown) => (entry as { value: TrackDTO }).value
    )
  }

  subscribe(l: DataListener): () => void {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  private emit(event: DataEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  async readBytes(trackId: string): Promise<ArrayBuffer> {
    const handle = this.getTrackHandle(trackId)
    if (!handle) {
      throw new Error(`No file handle found for trackId: ${trackId}`)
    }
    const file = await handle.getFile()
    return await file.arrayBuffer()
  }

  async readMetadata(trackId: string): Promise<AudioMetadata> {
    const handle = this.getTrackHandle(trackId)
    if (!handle) {
      throw new Error(`No file handle found for trackId: ${trackId}`)
    }
    const file = await handle.getFile()

    // Use music-metadata to parse the blob
    const mm = await import('music-metadata')
    const metadata = await mm.parseBlob(file)

    return {
      title: metadata.common.title,
      artist: metadata.common.artist,
      album: metadata.common.album,
      year: metadata.common.year,
      genre: metadata.common.genre?.[0],
      trackNumber: metadata.common.track?.no ?? undefined,
      duration: metadata.format.duration ?? 0,
      format: metadata.format.container?.toLowerCase(),
      bitrate: metadata.format.bitrate,
      sampleRate: metadata.format.sampleRate,
      channels: metadata.format.numberOfChannels
    }
  }

  async upsertTrack(track: TrackDTO): Promise<void> {
    await idbSet('tracks', track.id, track)
  }

  async deleteTrack(trackId: string): Promise<void> {
    await idbDelete('tracks', trackId)
    this.trackHandleMap.delete(trackId)
  }
}
