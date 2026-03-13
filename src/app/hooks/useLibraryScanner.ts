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

    const allTracks: Track[] = []
    const allFolders: FolderNode[] = []

    for (const path of libraryPaths) {
      const { folders, tracks } = await scanDirectory(path)
      allTracks.push(...tracks)
      allFolders.push(...folders)
    }

    setFolders(allFolders)
    setTracks(allTracks)
    setLoading(false)
  }, [ libraryPaths, setFolders, setTracks, setLoading ])

  const addAndScan = useCallback(async () => {
    const path = await selectDirectory()
    if (path) {
      return path
    }
    return null
  }, [])

  const playTrack = useCallback((track: Track, index: number) => {
    play(track)
  }, [ play ])

  return {
    scanLibrary,
    addAndScan,
    playTrack,
  }
}
