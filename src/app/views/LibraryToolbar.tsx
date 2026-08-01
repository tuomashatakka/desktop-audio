import { useState } from 'react'
import { useLibrary, useSettings, useUI } from '../contexts'
import type { Density, Grouping } from '../contexts'
import { Input, Popover } from '../components/atomic'
import { Breadcrumbs } from '../components/composite/Breadcrumbs'


const DENSITIES: readonly Density[] = [ 'compact', 'normal', 'relaxed' ]
const DENSITY_GLYPH: Record<Density, string> = { compact: '≡', normal: '≢', relaxed: '=' }

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
    currentView, selectedFolderPath, selectedPlaylistId, selectFolder,
    density, setDensity, grouping, setGrouping,
  } = useUI()
  const { filteredTracks, playlists, searchQuery, setSearchQuery, isLoading } = useLibrary()
  const { libraryPaths } = useSettings()
  const [ configOpen, setConfigOpen ] = useState(false)
  const [ configAnchor, setConfigAnchor ] = useState<HTMLButtonElement | null>(null)

  const activePlaylist = selectedPlaylistId
    ? playlists.find(playlist =>
      playlist.id === selectedPlaylistId)
    : undefined
  const optionsOpen = configOpen && currentView === 'library'

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
            onChange={event =>
              setSearchQuery(event.target.value)}
          />
        </li>

        <li>
          <fieldset className='density-toggle'>
            <legend>Row density</legend>

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

                <span aria-hidden='true'>{DENSITY_GLYPH[densityOption]}</span>
              </label>
            )}
          </fieldset>
        </li>

        <li>
          <button
            type='button'
            ref={setConfigAnchor}
            className='config-toggle'
            onClick={() =>
              setConfigOpen(current =>
                !current)}
            aria-label='View options'
            aria-expanded={optionsOpen}
            aria-controls='library-view-options'
            aria-haspopup='dialog'
          >
            <span aria-hidden='true'>⌄</span>
          </button>
        </li>
      </menu>

      <Popover
        id='library-view-options'
        label='View options'
        open={optionsOpen}
        anchor={configAnchor}
        onClose={() =>
          setConfigOpen(false)}
      >
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
      </Popover>
    </>
  )
}
