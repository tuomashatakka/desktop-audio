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
})
