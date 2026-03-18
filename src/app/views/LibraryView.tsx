import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track } from '../contexts'
import { useMemo, useEffect } from 'react'
import { useLibraryScanner } from '../hooks'
import { scanDirectory } from '../services'
import { Input } from '../components/atomic'
import { FolderTree } from '../components/composite/FolderTree'
import './LibraryView.css'


export function LibraryView () {
  const { selectedFolderPath, selectFolder } = useUI()
  const { folders, filteredTracks, searchQuery, setSearchQuery, selectTrack, setTracks, setLoading, isLoading, toggleFolder } = useLibrary()
  const { play, currentTrack, isPlaying } = useAudio()
  const { libraryPaths } = useSettings()
  const { scanLibrary } = useLibraryScanner()

  useEffect(() => {
    if (libraryPaths.length > 0 && folders.length === 0) {
      scanLibrary()
    }
  }, [ libraryPaths, folders.length, scanLibrary ])

  const handleFolderSelect = async (path: string) => {
    selectFolder(path)
    setLoading(true)

    const { tracks } = await scanDirectory(path)
    setTracks(tracks)
    setLoading(false)
  }

  const handleFolderToggle = (path: string) => {
    toggleFolder(path)
  }

  const handleTrackPlay = (track: Track, index: number) => {
    selectTrack(index)
    play(track)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const displayTracks = useMemo(() => {
    return filteredTracks
  }, [ filteredTracks ])

  return (
    <div className='library-view'>
      <aside className='library-sidebar'>
        <header>
          <h5>Folders</h5>
        </header>

        <FolderTree
          folders={folders}
          selectedPath={selectedFolderPath}
          onSelect={handleFolderSelect}
          onToggle={handleFolderToggle}
        />
      </aside>

      <section className='library-main'>
        <header className='view-header'>
          <h2>Library</h2>

          <div className='search-container'>
            <Input
              type='search'
              placeholder='Search tracks...'
              value={searchQuery}
              onChange={e =>
                setSearchQuery(e.target.value)}
            />
          </div>
        </header>

        <div className='tracks-container'>
          {isLoading
            ? <div className='status-message'>
              <p>Loading...</p>
            </div>
            : displayTracks.length === 0
              ? <div className='status-message'>
                <p>No tracks found</p>
                <small>Select a folder or add library paths in Settings</small>
              </div>
              : <table className='tracks-table'>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Title</th>
                    <th>Artist</th>
                    <th>Album</th>
                    <th className='duration'>Duration</th>
                  </tr>
                </thead>

                <tbody>
                  {displayTracks.map((track, index) =>
                    <tr
                      key={track.id}
                      className={currentTrack?.id === track.id ? 'active' : ''}
                      onClick={() =>
                        handleTrackPlay(track, index)}
                    >
                      <td className='track-number'>
                        {currentTrack?.id === track.id && isPlaying ? '▶' : index + 1}
                      </td>

                      <td className='track-title'>{track.title}</td>
                      <td className='track-artist'>{track.artist}</td>
                      <td className='track-album'>{track.album}</td>

                      <td className='track-duration'>
                        {formatDuration(track.duration)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </section>
    </div>
  )
}
