import { useCallback } from 'react'
import { useLibrary, useSettings, useAudio } from '../contexts'
import { scanDirectory, selectDirectory } from '../services'
import type { Track, FolderNode } from '../services'


export function useLibraryScanner () {
  const { setFolders, setTracks, setLoading } = useLibrary()
  const { libraryPaths } = useSettings()
  const { play } = useAudio()

  const scanLibrary = useCallback(async () => {
    if (libraryPaths.length === 0) {
      return
    }

    setLoading(true)
    setTracks([])

    const allFolders: FolderNode[] = []
    // Accumulate tracks from all paths, merging batches as they arrive
    const trackMap = new Map<string, Track>()

    const scanPath = (rootPath: string) =>
      new Promise<void>(resolve => {
        if (!window.electronAPI?.scanLibraryStream) {
          // Fallback to blocking scan if streaming not available
          scanDirectory(rootPath).then(({ folders, tracks }) => {
            allFolders.push(...folders)
            for (const t of tracks) {
              trackMap.set(t.id, t)
            }
            setTracks([ ...trackMap.values() ].sort((a, b) =>
              a.title.localeCompare(b.title)))
            resolve()
          })
          return
        }

        window.electronAPI.scanLibraryStream(
          rootPath,
          batch => {
            for (const t of batch) {
              trackMap.set(t.id, t)
            }
            // Push sorted snapshot so the table populates incrementally
            setTracks([ ...trackMap.values() ].sort((a, b) =>
              a.title.localeCompare(b.title)))
          },
          async () => {
            // Build folder tree from final track list once done
            const files = [ ...trackMap.values() ].map(t =>
              t.path)
            const { folders } = await scanDirectory(rootPath).catch(() =>
              ({ folders: [], tracks: [] as Track[] }))
            allFolders.push(...folders)
            resolve()
          }
        )
      })

    for (const rootPath of libraryPaths) {
      await scanPath(rootPath)
    }

    setFolders(allFolders)
    setLoading(false)
  }, [ libraryPaths, setFolders, setTracks, setLoading ])

  const addAndScan = useCallback(async () => {
    const path = await selectDirectory()
    if (path) {
      return path
    }
    return null
  }, [])

  const playTrack = useCallback((track: Track) => {
    play(track)
  }, [ play ])

  return {
    scanLibrary,
    addAndScan,
    playTrack,
  }
}
