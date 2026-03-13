import type { FolderNode, Track } from './types'


declare global {
  interface Window {
    readonly electronAPI?: {
      readonly scanDirectory:       (path: string) => Promise<readonly string[]>
      readonly getAudioMetadata:    (path: string) => Promise<{ readonly title?: string; readonly artist?: string; readonly album?: string; readonly duration?: number }>
      readonly selectDirectory:     () => Promise<string | null>
      readonly getMusicLibraryPath: () => Promise<string>
      readonly readFile:            (path: string) => Promise<ArrayBuffer>
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
    let currentPath = rootPath

    for (const [ index, part ] of parts.entries()) {
      if (index === parts.length - 1)
        continue

      currentPath = currentPath + '/' + part
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

  for (const [ path, folder ] of folderMap.entries()) {
    const parentPath = path.slice(0, Math.max(0, path.lastIndexOf('/'))) || path.slice(0, Math.max(0, path.lastIndexOf('\\')))
    const parent = folderMap.get(parentPath)
    if (parent && parentPath !== path) {
      parent.children.push(folder)
    }
  }

  return [ root ]
}

export async function getAudioMetadata (filePath: string): Promise<{ title?: string; artist?: string; album?: string; duration?: number }> {
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
