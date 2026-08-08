import { useLibrary, useSettings, useUI } from '../contexts'
import type { Density, Grouping } from '../contexts'
import { Icon, Input } from '../components/atomic'
import type { IconName } from '../services/types'
import { Breadcrumbs } from '../components/composite/Breadcrumbs'


const DENSITIES: readonly Density[] = [ 'compact', 'normal', 'relaxed' ]
const DENSITY_ICON: Record<Density, IconName> = {
  compact: 'density-compact',
  normal:  'density-normal',
  relaxed: 'density-relaxed',
}

const GROUPINGS: readonly Grouping[] = [ 'none', 'album', 'artist', 'path' ]
const GROUPING_LABEL: Record<Grouping, string> = {
  none:   'None',
  album:  'By Album',
  artist: 'By Artist',
  path:   'By Path',
}

/** Library-specific heading and controls hosted by the shell titlebar. */
export function LibraryToolbar () {
  const {
    selectedFolderPath, selectedPlaylistId, selectFolder,
    density, setDensity, grouping, setGrouping,
  } = useUI()
  const { filteredTracks, playlists, searchQuery, setSearchQuery, isLoading } = useLibrary()
  const { libraryPaths } = useSettings()
  const activePlaylist = selectedPlaylistId
    ? playlists.find(playlist =>
      playlist.id === selectedPlaylistId)
    : undefined
  return (
    <>
      <div className='library-heading'>
        {activePlaylist
          ? <h1>{activePlaylist.name}</h1>
          : <Breadcrumbs
            path={selectedFolderPath}
            roots={libraryPaths}
            onNavigate={selectFolder}
          />
        }

        {isLoading && filteredTracks.length > 0 &&
          <small className='scan-status' role='status'>Scanning…</small>
        }
      </div>

      <menu className='view-controls' aria-label='Library view controls'>
        <li>
          <Input
            wrapperClass='search-input'
            type='search'
            placeholder='Search tracks...'
            aria-label='Search tracks'
            value={searchQuery}
            startAdornment={<Icon name='search' />}
            onChange={event =>
              setSearchQuery(event.target.value)}
          />
        </li>

        <li>
          <fieldset className='density-toggle'>
            <legend className='sr-only'>Row density</legend>

            {DENSITIES.map(densityOption =>
              <label key={densityOption} title={`${densityOption} density`}>
                <input
                  type='radio'
                  name='density'
                  value={densityOption}
                  aria-label={`${densityOption} density`}
                  checked={density === densityOption}
                  onChange={() =>
                    setDensity(densityOption)}
                />

                <Icon name={DENSITY_ICON[densityOption]} />
              </label>
            )}
          </fieldset>
        </li>

        <li>
          <button
            type='button'
            className='config-toggle'
            popoverTarget='library-view-options'
            aria-label='View options'
          >
            <Icon name='chevron-right' />
          </button>
        </li>
      </menu>

      <div id='library-view-options' className='popover-panel' popover='auto'>
        <fieldset className='config-menu'>
          <legend>Grouping</legend>

          {GROUPINGS.map(groupingOption =>
            <label key={groupingOption}>
              <input
                type='radio'
                name='grouping'
                value={groupingOption}
                checked={grouping === groupingOption}
                onChange={() =>
                  setGrouping(groupingOption)}
              />

              {GROUPING_LABEL[groupingOption]}
            </label>
          )}
        </fieldset>
      </div>
    </>
  )
}
