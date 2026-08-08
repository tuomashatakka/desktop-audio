import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackTable } from '../../../src/app/components/composite/TrackTable'
import { UIProvider } from '../../../src/app/contexts'
import { Track } from '../../../src/app/models'
import { noop } from '../../../src/app/utils/noop'


type UIValue = NonNullable<ComponentProps<typeof UIProvider>['value']>

const uiValue: UIValue = {
  currentView:        'library',
  previousView:       null,
  sidebarOpen:        false,
  selectedFolderPath: null,
  selectedPlaylistId: null,
  editingTrackId:     null,
  density:            'normal',
  grouping:           'artist',
  setView:            noop,
  toggleSidebar:      noop,
  selectFolder:       noop,
  selectPlaylist:     noop,
  setEditingTrack:    noop,
  setDensity:         noop,
  setGrouping:        noop,
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
