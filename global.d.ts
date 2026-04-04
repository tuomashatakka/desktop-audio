import { AudioMetadata, Track } from "./src/app/services/types"

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
  }

  interface Window {
    readonly electronAPI: ElectronAPI
  }
}

export {}