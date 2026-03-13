import { useUI, useLibrary, useAudio, useSettings } from '../contexts'
import type { Track, FolderNode } from '../contexts'
import { useMemo, useEffect } from 'react'
import { useLibraryScanner } from '../hooks'
import { scanDirectory } from '../services'
import { Input } from '../components/atomic'


export function LibraryView () {
  const { selectedFolderPath, selectFolder, setEditingTrack } = useUI()
  const { folders, filteredTracks, searchQuery, setSearchQuery, selectTrack, setTracks, setFolders, setLoading, isLoading, toggleFolder } = useLibrary()
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
    if (!selectedFolderPath)
      return filteredTracks
    return filteredTracks
  }, [ selectedFolderPath, filteredTracks ])

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 260, borderRight: '1px solid var(--border)', overflow: 'auto', background: 'var(--bg-raised)' }}>
        <div style={{ padding: 'var(--sp-3)' }}>
          <h5>Folders</h5>
        </div>

        <FolderTree
          folders={folders}
          selectedPath={selectedFolderPath}
          onSelect={handleFolderSelect}
          onToggle={handleFolderToggle}
        />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className='view-header'>
          <h2>Library</h2>

          <div style={{ width: 250 }}>
            <Input
              type='search'
              placeholder='Search tracks...'
              value={searchQuery}
              onChange={e =>
                setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-4)' }}>
          {isLoading
            ? <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--text-muted)' }}>
              <p>Loading...</p>
            </div>
            : displayTracks.length === 0
              ? <div style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--text-muted)' }}>
                <p>No tracks found</p>
                <small>Select a folder or add library paths in Settings</small>
              </div>
              : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: 'var(--sp-2)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)', fontSize: 'var(--text-sm)' }}>#</th>
                    <th style={{ textAlign: 'left', padding: 'var(--sp-2)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)', fontSize: 'var(--text-sm)' }}>Title</th>
                    <th style={{ textAlign: 'left', padding: 'var(--sp-2)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)', fontSize: 'var(--text-sm)' }}>Artist</th>
                    <th style={{ textAlign: 'left', padding: 'var(--sp-2)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)', fontSize: 'var(--text-sm)' }}>Album</th>
                    <th style={{ textAlign: 'right', padding: 'var(--sp-2)', color: 'var(--text-muted)', fontWeight: 'var(--font-normal)', fontSize: 'var(--text-sm)' }}>Duration</th>
                  </tr>
                </thead>

                <tbody>
                  {displayTracks.map((track, index) =>

                    <tr
                      key={track.id}
                      onClick={() =>
                        handleTrackPlay(track, index)}
                      style={{
                        cursor:     'pointer',
                        background: currentTrack?.id === track.id ? 'var(--accent-muted)' : 'transparent',
                      }}
                      onMouseEnter={e =>
                        e.currentTarget.style.background = currentTrack?.id === track.id ? 'var(--accent-muted)' : 'var(--bg-hover)'}
                      onMouseLeave={e =>
                        e.currentTarget.style.background = currentTrack?.id === track.id ? 'var(--accent-muted)' : 'transparent'}
                    >
                      <td style={{ padding: 'var(--sp-2)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                        {currentTrack?.id === track.id && isPlaying ? '▶' : index + 1}
                      </td>

                      <td style={{ padding: 'var(--sp-2)' }}>{track.title}</td>
                      <td style={{ padding: 'var(--sp-2)', color: 'var(--text-dim)' }}>{track.artist}</td>
                      <td style={{ padding: 'var(--sp-2)', color: 'var(--text-dim)' }}>{track.album}</td>

                      <td style={{ textAlign: 'right', padding: 'var(--sp-2)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                        {formatDuration(track.duration)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
          }
        </div>
      </div>
    </div>
  )
}

interface FolderTreeProps {
  readonly folders:      ReadonlyArray<FolderNode>
  readonly selectedPath: string | null
  readonly onSelect:     (path: string) => void
  readonly onToggle:     (path: string) => void
  readonly level?:       number
}

function FolderTree ({ folders, selectedPath, onSelect, onToggle, level = 0 }: FolderTreeProps) {
  return (
    <div className='folder-tree'>
      {folders.map(folder =>

        <div key={folder.id} className='folder-tree-node'>
          <button
            className={`folder-row ${selectedPath === folder.path ? 'active' : ''}`}
            onClick={() =>
              onSelect(folder.path)}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          'var(--sp-2)',
              width:        '100%',
              padding:      'var(--sp-2) var(--sp-3)',
              paddingLeft:  `calc(var(--sp-3) + ${level * 16}px)`,
              textAlign:    'left',
              background:   selectedPath === folder.path ? 'var(--accent-muted)' : 'transparent',
              color:        selectedPath === folder.path ? 'var(--accent)' : 'var(--text-dim)',
              borderRadius: 'var(--radius)',
              cursor:       'pointer',
              border:       'none',
            }}
          >
            {folder.children.length > 0 && (
              <span
                className='folder-toggle'
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(folder.path)
                }}
                style={{
                  width:     16,
                  textAlign: 'center',
                  fontSize: 'var(--text-xs)',
                }}
              >
                {folder.expanded ? '▼' : '▶'}
              </span>
            )}
            <span className='folder-icon'>
              {folder.children.length > 0
                ? (folder.expanded ? '📂' : '📁')
                : '🎵'
              }
            </span>
            <span style={{ fontSize: 'var(--text-sm)' }}>{folder.name}</span>
          </button>

          {folder.expanded && folder.children.length > 0 &&
            <FolderTree
              folders={folder.children}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
              level={level + 1}
            />
          }
        </div>
      )}
    </div>
  )
}
