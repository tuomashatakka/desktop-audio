import { AudioMetadata, Track, SerializableMenuItem, MediaState } from "./src/app/services/types"

declare global {
  interface ElectronAPI {
    // Library
    readonly scanLibrary: (dirPaths: string[]) => void
    readonly loadLibrary: () => Promise<readonly Track[]>
    readonly onLibraryBatch: (cb: (tracks: Track[]) => void) => () => void
    readonly onLibraryDone: (cb: () => void) => () => void

    // Files
    readonly selectDirectory: () => Promise<string | null>
    readonly getMusicDir: () => Promise<string>
    readonly readFile: (path: string) => Promise<ArrayBuffer>
    readonly getAudioMetadata: (path: string) => Promise<AudioMetadata>

    // Window
    readonly minimizeWindow: () => void
    readonly maximizeWindow: () => void
    readonly closeWindow: () => void
    readonly isMaximized: () => Promise<boolean>

    // Media keys
    readonly onMediaPlayPause: (cb: () => void) => () => void
    readonly onMediaNext:      (cb: () => void) => () => void
    readonly onMediaPrev:      (cb: () => void) => () => void

    // Context menu
    readonly showContextMenu:      (items: SerializableMenuItem[], x: number, y: number, width: number, height: number) => void
    readonly hideContextMenu:      () => void
    readonly onContextMenuAction:  (cb: (index: number) => void) => () => void

    // Media state (MPRIS / native controls)
    readonly updateMediaState: (state: MediaState) => void
    readonly onMediaSeek:      (cb: (delta: number) => void) => () => void

    // Write IPC
    readonly upsertModel: (kind: string, payload: Record<string, unknown>) => void
    readonly deleteModel: (kind: string, id: string) => void
  }

  interface Window {
    readonly electronAPI: ElectronAPI
  }
}

export {}
