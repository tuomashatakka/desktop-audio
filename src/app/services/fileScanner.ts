import type { FolderNode, Track, AudioMetadata } from './types'


declare global {
  interface Window {
    readonly electronAPI?: {
      readonly scanDirectory:       (path: string) => Promise<readonly string[]>
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

const AUDIO_EXTENSIONS = [ '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma' ]

function generateId (): string {
  return Math.random().toString(36)
    .slice(2, 11)
}

function getFileName (path: string): string {
  const parts = path.split(/[/\\]/)
  const fileName = parts[parts.length - 1] || ''
  return fileName.replace(/\.[^.]+$/, '')
}

function getExtension (path: string): string {
  const match = path.match(/\.[^.]+$/)
  return match ? match[0].toLowerCase() : ''
}

export async function scanDirectory (rootPath: string): Promise<{ folders: FolderNode[]; tracks: Track[] }> {
  if (window.electronAPI?.scanDirectory) {
    try {
      const files = await window.electronAPI.scanDirectory(rootPath)
      const tracks = files
        .filter(file =>
          AUDIO_EXTENSIONS.includes(getExtension(file)))
        .map(file =>
          ({
            id:       generateId(),
            path:     file,
            title:    getFileName(file),
            artist:   'Unknown Artist',
            album:    'Unknown Album',
            duration: 0,
            format:   getExtension(file).replace('.', '')
              .toUpperCase(),
          }))

      const folders = buildFolderTree(rootPath, files)

      return { folders, tracks }
    }
    catch (error) {
      console.error('Error scanning directory:', error)
      return { folders: [], tracks: []}
    }
  }

  return { folders: [], tracks: []}
}

function buildFolderTree (rootPath: string, files: readonly string[]): FolderNode[] {
  const folderMap = new Map<string, FolderNode>()
  const rootName = rootPath.split(/[/\\]/).pop() || 'Library'

  const root: FolderNode = {
    id:       generateId(),
    name:     rootName,
    path:     rootPath,
    children: [],
    expanded: true,
  }
  folderMap.set(rootPath, root)

  const folderPaths = new Set<string>()
  for (const file of files) {
    const relativePath = file.slice(rootPath.length).replace(/^[\\/]/, '')
    const parts = relativePath.split(/[/\\]/)

    // eslint-disable-next-line functional/no-let
    let currentPath = rootPath
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = currentPath + '/' + parts[i]
      folderPaths.add(currentPath)
    }
  }

  for (const folderPath of folderPaths) {
    const parts = folderPath.replace(rootPath, '').replace(/^[\\/]/, '')
      .split(/[/\\]/)
    const name = parts[parts.length - 1]

    const folder: FolderNode = {
      id:       generateId(),
      name,
      path:     folderPath,
      children: [],
      expanded: false,
    }

    folderMap.set(folderPath, folder)
  }

  const foldersByPath = Array.from(folderMap.entries())

  for (const [ path, folder ] of foldersByPath) {
    const parentPath = path.slice(0, Math.max(0, path.lastIndexOf('/'))) || path.slice(0, Math.max(0, path.lastIndexOf('\\')))
    const parent = folderMap.get(parentPath)
    if (parent && parentPath !== path) {
      const updatedChildren = [ ...parent.children, folder ] as readonly FolderNode[]
      folderMap.set(parentPath, { ...parent, children: updatedChildren })
    }
  }

  return [ folderMap.get(rootPath) as FolderNode ]
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
