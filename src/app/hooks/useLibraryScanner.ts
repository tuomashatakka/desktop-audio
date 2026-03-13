import { useCallback } from 'react'
import { useLibrary, useSettings, useAudio } from '../contexts'
import { scanDirectory, selectDirectory } from '../services'
import type { Track } from '../services'


export function useLibraryScanner () {
  const { setFolders, setTracks, setLoading } = useLibrary()
  const { libraryPaths } = useSettings()
  const { play } = useAudio()

  const scanLibrary = useCallback(async () => {
    if (libraryPaths.length === 0) {
      return
    }

    setLoading(true)

    const allTracks: readonly Track[] = []
    const allFolders: readonly { readonly id: string; readonly name: string; readonly path: string; readonly children: readonly unknown[]; readonly expanded: boolean }[] = []

    for (const path of libraryPaths) {
      const { folders, tracks } = await scanDirectory(path)
      allTracks.push(...tracks)
      allFolders.push(...folders)
    }

    setFolders(allFolders as readonly never[])
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
