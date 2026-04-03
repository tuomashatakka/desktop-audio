import type { FolderNode, Track, AudioMetadata } from './types'


declare global {
  interface Window {
    readonly electronAPI?: {
      readonly scanDirectory:       (path: string) => Promise<readonly string[]>
      readonly scanLibrary:         (path: string) => Promise<readonly Track[]>
      readonly getAudioMetadata:    (path: string) => Promise<AudioMetadata>
      readonly selectDirectory:     () => Promise<string | null>
      readonly getMusicLibraryPath: () => Promise<string>
      readonly readFile:            (path: string) => Promise<ArrayBuffer>
      readonly minimizeWindow:      () => void
      readonly maximizeWindow:      () => void
      readonly closeWindow:         () => void
      readonly isMaximized:         () => Promise<boolean>
    }
  }
}

function generateId (): string {
  return Math.random().toString(36)
    .slice(2, 11)
}

export async function scanDirectory (rootPath: string): Promise<{ folders: FolderNode[]; tracks: Track[] }> {
  if (!window.electronAPI?.scanLibrary) {
    return { folders: [], tracks: []}
  }

  try {
    // Enrich scan: main process reads tags + falls back to filename parsing
    const tracks = await window.electronAPI.scanLibrary(rootPath)

    // Still need raw file list to build the folder tree
    const files = window.electronAPI.scanDirectory
      ? await window.electronAPI.scanDirectory(rootPath)
      : tracks.map(t =>
        t.path)

    const folders = buildFolderTree(rootPath, files)
    return { folders, tracks: tracks as Track[] }
  }
  catch (error) {
    console.error('Error scanning directory:', error)
    return { folders: [], tracks: []}
  }
}

function buildFolderTree (rootPath: string, files: readonly string[]): FolderNode[] {
  // Map each parent path to its direct child paths (deduped)
  const childrenMap = new Map<string, string[]>()

  for (const file of files) {
    const relativePath = file.slice(rootPath.length).replace(/^[\\/]/, '')
    const parts = relativePath.split(/[/\\]/)

    // eslint-disable-next-line functional/no-let
    let currentPath = rootPath
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath
      currentPath = currentPath + '/' + parts[i]

      if (!childrenMap.has(parentPath)) {
        childrenMap.set(parentPath, [])
      }
      const siblings = childrenMap.get(parentPath)!
      if (!siblings.includes(currentPath)) {
        siblings.push(currentPath)
      }
    }
  }

  function buildNode (path: string, isRoot: boolean): FolderNode {
    const childPaths = childrenMap.get(path) ?? []
    const name = path.split(/[/\\]/).pop() || path
    return {
      id:       generateId(),
      name,
      path,
      children: childPaths.map(p =>
        buildNode(p, false)),
      expanded: isRoot,
    }
  }

  return [ buildNode(rootPath, true) ]
}

export async function getAudioMetadata (filePath: string): Promise<AudioMetadata> {
  if (window.electronAPI?.getAudioMetadata) {
    try {
      return await window.electronAPI.getAudioMetadata(filePath)
    }
    catch (error) {
      console.error('Error reading metadata:', error)
    }
  }
  return {}
}

export async function selectDirectory (): Promise<string | null> {
  if (window.electronAPI?.selectDirectory) {
    try {
      return await window.electronAPI.selectDirectory()
    }
    catch (error) {
      console.error('Error selecting directory:', error)
    }
  }
  return null
}
