import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackTable } from '../../../src/app/components/composite/TrackTable'
import { UIProvider } from '../../../src/app/contexts'
import { Track } from '../../../src/app/models'
import { noop } from '../../../src/app/utils/noop'


type UIValue = NonNullable<ComponentProps<typeof UIProvider>['value']>

const uiValue: UIValue = {
  overlay:            null,
  sidebarOpen:        false,
  selectedFolderPath: null,
  selectedPlaylistId: null,
  selectedList:       null,
  selectedGroup:      null,
  editingTrackId:     null,
  density:            'normal',
  grouping:           'artist',
  sidebarWidth:       220,
  openOverlay:        noop,
  closeOverlay:       noop,
  toggleSidebar:      noop,
  selectFolder:       noop,
  selectPlaylist:     noop,
  selectList:         noop,
  selectGroup:        noop,
  setEditingTrack:    noop,
  setDensity:         noop,
  setGrouping:        noop,
  setSidebarWidth:    noop,
}

const tracks = [
  Track.fromDTO({
    id:         'track-1',
    title:      'First Track',
    artist:     'One Artist',
    album:      'One Album',
    duration:   185,
    format:     'mp3',
    size:       1024,
    coverColor: '#123456',
    path:       '/music/first.mp3',
    year:       2024,
    rating:     4,
  }),
  Track.fromDTO({
    id:         'track-2',
    title:      'Second Track',
    artist:     'One Artist',
    album:      'One Album',
    duration:   245,
    format:     'flac',
    size:       2048,
    coverColor: '#654321',
    path:       '/music/second.flac',
  }),
  Track.fromDTO({
    id:         'track-3',
    title:      'Third Track',
    artist:     'Another Artist',
    album:      'Another Album',
    duration:   200,
    format:     'ogg',
    size:       4096,
    coverColor: '#abcdef',
    path:       '/music/third.ogg',
  }),
]

describe('TrackTable', () => {
  it('uses native grouped track buttons with roving keyboard focus', async () => {
    const onPlay = vi.fn()
    render(
      <UIProvider value={uiValue}>
        <TrackTable
          tracks={tracks}
          isLoading={false}
          currentTrack={tracks[0]}
          isPlaying={false}
          onPlay={onPlay}
        />
      </UIProvider>
    )

    const first = screen.getByRole('button', { name: /first track/i })
    const second = screen.getByRole('button', { name: /second track/i })
    expect(first).toHaveAttribute('tabindex', '0')
    expect(second).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('3:05')).toHaveAttribute('datetime', 'PT3M5S')

    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    await waitFor(() =>
      expect(second).toHaveFocus())

    fireEvent.keyDown(second, { key: ' ' })
    expect(onPlay).toHaveBeenCalledWith(tracks[1], 1)
  })

  it('applies an alt group disclosure change to every group', () => {
    render(
      <UIProvider value={uiValue}>
        <TrackTable
          tracks={tracks}
          isLoading={false}
          currentTrack={null}
          isPlaying={false}
          onPlay={vi.fn()}
        />
      </UIProvider>
    )

    fireEvent.click(screen.getAllByRole('button', { name: /^Collapse / })[0], { altKey: true })
    expect(screen.queryByRole('button', { name: /first track/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /third track/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /^Expand / })[0], { altKey: true })
    expect(screen.getByRole('button', { name: /first track/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /third track/i })).toBeInTheDocument()
  })

  it('opens every column option at the exact pointer position and updates in place', () => {
    const onTrackContext = vi.fn()
    const { container } = render(
      <UIProvider value={uiValue}>
        <TrackTable
          tracks={tracks}
          isLoading={false}
          currentTrack={null}
          isPlaying={false}
          onPlay={vi.fn()}
          onContextMenu={onTrackContext}
        />
      </UIProvider>
    )

    const titleHeader = screen.getByRole('button', { name: 'Title' })
    fireEvent.contextMenu(titleHeader, { clientX: 137, clientY: 59 })

    const panel = document.body.querySelector<HTMLElement>('.popover-panel.at-point')
    expect(panel).toHaveStyle({ left: '137px', top: '59px' })
    expect(screen.getByRole('checkbox', { name: 'Year', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Rating', hidden: true })).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Artist' }), {
      clientX: 211,
      clientY: 73,
    })
    expect(panel).toHaveStyle({ left: '211px', top: '73px' })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Rating', hidden: true }))
    expect(container.querySelector('.track-row .col-rating')).toHaveTextContent('4/5')

    fireEvent.contextMenu(screen.getByRole('button', { name: /first track/i }), {
      screenX: 540,
      screenY: 320,
    })
    expect(onTrackContext).toHaveBeenCalledWith(tracks[0], { x: 540, y: 320 })
  })
})

/*
 * Interleaved artists: sorted by title the order is A, B, C, but grouped by
 * artist it renders A, C (Xylo) then B (Yarrow). Global index order and render
 * order therefore disagree — which is exactly the case arrow keys used to get
 * wrong, stepping to whatever row held the adjacent index rather than the row
 * below.
 */
const interleaved = [
  Track.fromDTO({
    id: 'a', title: 'Alpha', artist: 'Xylo', album: 'X', duration: 100,
    format: 'mp3', size: 1, coverColor: '#000', path: '/a.mp3',
  }),
  Track.fromDTO({
    id: 'b', title: 'Bravo', artist: 'Yarrow', album: 'Y', duration: 100,
    format: 'mp3', size: 1, coverColor: '#000', path: '/b.mp3',
  }),
  Track.fromDTO({
    id: 'c', title: 'Charlie', artist: 'Xylo', album: 'X', duration: 100,
    format: 'mp3', size: 1, coverColor: '#000', path: '/c.mp3',
  }),
]

function renderInterleaved (onPlay = vi.fn()) {
  render(
    <UIProvider value={uiValue}>
      <TrackTable
        tracks={interleaved}
        isLoading={false}
        currentTrack={null}
        isPlaying={false}
        onPlay={onPlay}
      />
    </UIProvider>
  )
  return onPlay
}

const row = (name: RegExp) =>
  screen.getByRole('button', { name })

describe('TrackTable grouped keyboard navigation', () => {
  it('renders group order, not global sort order', () => {
    renderInterleaved()

    const titles = screen.getAllByRole('button', { name: /alpha|bravo|charlie/i })
      .map(el => el.textContent)

    expect(titles.map(t => t?.match(/Alpha|Bravo|Charlie/)?.[0])).toEqual([ 'Alpha', 'Charlie', 'Bravo' ])
  })

  it('ArrowDown follows the rendered order across a group boundary', async () => {
    renderInterleaved()

    row(/alpha/i).focus()
    fireEvent.keyDown(row(/alpha/i), { key: 'ArrowDown' })

    // Charlie is the next *rendered* row; Bravo holds the next global index.
    await waitFor(() =>
      expect(row(/charlie/i)).toHaveFocus())

    fireEvent.keyDown(row(/charlie/i), { key: 'ArrowDown' })
    await waitFor(() =>
      expect(row(/bravo/i)).toHaveFocus())
  })

  it('ArrowUp walks back through the rendered order', async () => {
    renderInterleaved()

    row(/bravo/i).focus()
    fireEvent.keyDown(row(/bravo/i), { key: 'ArrowUp' })

    await waitFor(() =>
      expect(row(/charlie/i)).toHaveFocus())
  })

  it('End lands on the last rendered row, not the last sorted track', async () => {
    renderInterleaved()

    row(/alpha/i).focus()
    fireEvent.keyDown(row(/alpha/i), { key: 'End' })

    await waitFor(() =>
      expect(row(/bravo/i)).toHaveFocus())
  })

  it('ArrowLeft collapses the row\'s group', () => {
    renderInterleaved()

    fireEvent.keyDown(row(/alpha/i), { key: 'ArrowLeft' })

    expect(screen.queryByRole('button', { name: /alpha/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /charlie/i })).not.toBeInTheDocument()
    // The other group is untouched.
    expect(screen.getByRole('button', { name: /bravo/i })).toBeInTheDocument()
  })

  it('a collapsed group drops out of the navigation order', async () => {
    renderInterleaved()

    fireEvent.keyDown(row(/alpha/i), { key: 'ArrowLeft' })

    row(/bravo/i).focus()
    fireEvent.keyDown(row(/bravo/i), { key: 'ArrowUp' })

    // Nothing above it any more, so focus stays put.
    await waitFor(() =>
      expect(row(/bravo/i)).toHaveFocus())
  })

  it('ArrowRight is a no-op on a row whose group is already open', () => {
    renderInterleaved()

    fireEvent.keyDown(row(/alpha/i), { key: 'ArrowRight' })

    expect(screen.getByRole('button', { name: /alpha/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /charlie/i })).toBeInTheDocument()
  })

  it('plays the whole album from the group heading cover', () => {
    const onPlayGroup = vi.fn()
    const onPlay      = vi.fn()

    render(
      <UIProvider value={{ ...uiValue, grouping: 'album' }}>
        <TrackTable
          tracks={ tracks }
          isLoading={ false }
          currentTrack={ null }
          isPlaying={ false }
          onPlay={ onPlay }
          onPlayGroup={ onPlayGroup } />
      </UIProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play One Album' }))

    // The album's own tracks, not the whole table, and from the top.
    expect(onPlayGroup).toHaveBeenCalledWith(
      expect.arrayContaining([ expect.objectContaining({ album: 'One Album' }) ])
    )
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('keeps the album cover button out of the rows, which are buttons themselves', () => {
    const { container } = render(
      <UIProvider value={{ ...uiValue, grouping: 'album' }}>
        <TrackTable
          tracks={ tracks }
          isLoading={ false }
          currentTrack={ null }
          isPlaying={ false }
          onPlay={ noop }
          onPlayGroup={ noop } />
      </UIProvider>
    )

    expect(container.querySelector('button button')).toBeNull()
  })

  it('falls back to normal rows when a grid density is selected', () => {
    const { container } = render(
      <UIProvider value={{ ...uiValue, density: 'grid-lg', grouping: 'none' }}>
        <TrackTable
          tracks={ tracks }
          isLoading={ false }
          currentTrack={ null }
          isPlaying={ false }
          onPlay={ noop } />
      </UIProvider>
    )

    expect(container.querySelector('.track-table')).toHaveAttribute('data-density', 'normal')
  })
})

/*
 * Selection and playback are two different gestures now: a click picks rows,
 * a double click starts them. A single click used to play, which made picking
 * three tracks to drag somewhere impossible without playing all three.
 *
 * These render grouped, like the tests above: a flat list is virtualized, and
 * jsdom's zero-height scroll container mounts none of its rows.
 */
describe('TrackTable selection', () => {
  const renderGrouped = (onPlay = vi.fn()) => {
    render(
      <UIProvider value={ uiValue }>
        <TrackTable
          tracks={ tracks }
          isLoading={ false }
          currentTrack={ null }
          isPlaying={ false }
          onPlay={ onPlay } />
      </UIProvider>
    )
    return onPlay
  }

  it('selects on a plain click without starting playback', () => {
    const onPlay = renderGrouped()

    fireEvent.click(row(/first track/i))

    expect(row(/first track/i)).toHaveAttribute('aria-pressed', 'true')
    expect(row(/second track/i)).toHaveAttribute('aria-pressed', 'false')
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('plays on a double click', () => {
    const onPlay = renderGrouped()

    fireEvent.doubleClick(row(/second track/i))

    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onPlay.mock.calls[0][0]).toMatchObject({ title: 'Second Track' })
  })

  it('adds one row at a time with ctrl/cmd, and takes a run with shift', () => {
    renderGrouped()

    fireEvent.click(row(/first track/i))
    fireEvent.click(row(/third track/i), { ctrlKey: true })

    expect(row(/first track/i)).toHaveAttribute('aria-pressed', 'true')
    expect(row(/second track/i)).toHaveAttribute('aria-pressed', 'false')
    expect(row(/third track/i)).toHaveAttribute('aria-pressed', 'true')

    // Shift extends from the row the ctrl-click last touched, through the
    // *rendered* order — Third and Second are adjacent on screen.
    fireEvent.click(row(/second track/i), { shiftKey: true })
    expect(row(/second track/i)).toHaveAttribute('aria-pressed', 'true')
    expect(row(/third track/i)).toHaveAttribute('aria-pressed', 'true')
    expect(row(/first track/i)).toHaveAttribute('aria-pressed', 'false')
  })

  it('still plays from the keyboard, where there is no double click', () => {
    const onPlay = renderGrouped()

    fireEvent.keyDown(row(/first track/i), { key: 'Enter' })

    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})

const folderRows = [
  { path: '/music/rock', name: 'Rock', trackCount: 12 },
  { path: '/music/jazz', name: 'Jazz', trackCount: 1 },
]

describe('TrackTable folder rows', () => {
  it('lists the subfolders above the tracks and opens one on double click', () => {
    const onNavigate = vi.fn()

    render(
      <UIProvider value={ uiValue }>
        <TrackTable
          tracks={ tracks }
          isLoading={ false }
          currentTrack={ null }
          isPlaying={ false }
          folders={ folderRows }
          onPlay={ vi.fn() }
          onNavigate={ onNavigate } />
      </UIProvider>
    )

    const rock = screen.getByRole('button', { name: /Rock/ })
    expect(rock).toHaveTextContent('12 tracks')
    expect(screen.getByRole('button', { name: /Jazz/ })).toHaveTextContent('1 track')

    fireEvent.click(rock)
    expect(onNavigate).not.toHaveBeenCalled()

    fireEvent.doubleClick(rock)
    expect(onNavigate).toHaveBeenCalledWith('/music/rock')
  })

  it('renders nothing when the caller passes no folders', () => {
    const { container } = render(
      <UIProvider value={ uiValue }>
        <TrackTable
          tracks={ tracks }
          isLoading={ false }
          currentTrack={ null }
          isPlaying={ false }
          onPlay={ vi.fn() } />
      </UIProvider>
    )

    expect(container.querySelector('.folder-rows')).toBeNull()
  })
})

describe('TrackTable natural order', () => {
  const renderQueue = (naturalOrder: string | null) => {
    const { container } = render(
      <UIProvider value={ uiValue }>
        <TrackTable
          tracks={ [ tracks[2], tracks[0], tracks[1] ] }
          isLoading={ false }
          currentTrack={ null }
          isPlaying={ false }
          naturalOrder={ naturalOrder }
          onPlay={ vi.fn() } />
      </UIProvider>
    )

    return [ ...container.querySelectorAll('.track-row') ]
      .map(el => el.textContent?.match(/First|Second|Third/)?.[0])
  }

  it('shows a named list in the order it was handed, not sorted by title', () => {
    // The queue was handed over reversed; sorting by title would undo that.
    expect(renderQueue('queue')).toEqual([ 'Third', 'First', 'Second' ])
  })

  it('sorts by title when no list is named', () => {
    expect(renderQueue(null)).toEqual([ 'First', 'Second', 'Third' ])
  })
})
