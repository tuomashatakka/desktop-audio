import { useLibrary, useSettings, useUI } from '../contexts'
import type { Density, Grouping } from '../contexts'
import { SegmentedControl } from '../components/atomic'
import type { SegmentedOption } from '../components/atomic'
import { Breadcrumbs } from '../components/composite/Breadcrumbs'
import type { Crumb } from '../components/composite/Breadcrumbs'


const DENSITIES: readonly SegmentedOption<Density>[] = [
  { value: 'compact', label: 'Compact rows', icon: 'density-compact' },
  { value: 'normal', label: 'Normal rows', icon: 'density-normal' },
  { value: 'relaxed', label: 'Relaxed rows', icon: 'density-relaxed' },
  { value: 'grid-sm', label: 'Small grid', icon: 'grid-sm' },
  { value: 'grid-lg', label: 'Large grid', icon: 'grid-lg' },
]

/** Titles for the two playback-derived lists; they have no path to show. */
const LIST_TITLES = {
  queue:   'Playback queue',
  history: 'Last played',
} as const

const GROUPINGS: readonly SegmentedOption<Grouping>[] = [
  { value: 'none', label: 'None' },
  { value: 'album', label: 'Album' },
  { value: 'artist', label: 'Artist' },
  { value: 'path', label: 'Folder' },
]

/**
 * Where you are in the library, and how it is laid out.
 *
 * This used to live in the titlebar, two containers away from the list it
 * acts on and hidden whenever another view was active. It sits directly above
 * the collection now; only the search box is still titlebar chrome.
 */
export function LibraryToolbar () {
  const {
    selectedFolderPath, selectedPlaylistId, selectedList, selectedGroup,
    selectFolder, density, setDensity, grouping, setGrouping,
  }                                              = useUI()
  const { filteredTracks, playlists, isLoading } = useLibrary()
  const { libraryPaths }                         = useSettings()

  const activePlaylist = selectedPlaylistId
    ? playlists.find(playlist =>
      playlist.id === selectedPlaylistId)
    : undefined

  // A drilled-into album or artist is not a folder, so it rides along as an
  // extra crumb rather than pretending to be part of the path.
  const trail: readonly Crumb[] = selectedGroup
    ? [{ label: selectedGroup.label, path: null }]
    : []

  return <header className='library-toolbar'>
    {selectedList
      ? <h1>{LIST_TITLES[selectedList]}</h1>
      : activePlaylist
        ? <h1>{activePlaylist.name}</h1>
        : <Breadcrumbs
          path={ selectedFolderPath }
          roots={ libraryPaths }
          trail={ trail }
          label='Library location'
          onNavigate={ selectFolder } />
    }

    {isLoading && filteredTracks.length > 0 &&
      <small className='scan-status' role='status'>Scanning…</small>
    }

    <div className='toolbar-controls'>
      <SegmentedControl
        legend='Group tracks by'
        value={ grouping }
        options={ GROUPINGS }
        onChange={ setGrouping } />

      <SegmentedControl
        legend='Collection layout'
        value={ density }
        options={ DENSITIES }
        iconOnly
        onChange={ setDensity } />
    </div>
  </header>
}
