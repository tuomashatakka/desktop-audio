import { useEffect } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { LibrarySidebar } from '../../src/app/layout/LibrarySidebar'
import { useLibrary } from '../../src/app/contexts'
import { Track } from '../../src/app/models'
import { DND_MIME } from '../../src/app/utils/dnd'
import type { DragPayload } from '../../src/app/utils/dnd'
import { renderWithProviders } from '../helpers/renderWithProviders'


function track (id: string, title: string, path: string): Track {
  return Track.fromDTO({
    id,
    title,
    path,
    artist:     'Artist',
    album:      'Album',
    duration:   100,
    format:     'mp3',
    size:       1,
    coverColor: '#000',
  })
}

const library = [
  track('/music/rock/one.mp3', 'One', '/music/rock/one.mp3'),
  track('/music/rock/two.mp3', 'Two', '/music/rock/two.mp3'),
  track('/music/jazz/three.mp3', 'Three', '/music/jazz/three.mp3'),
]

/** The sidebar resolves drops against the library, so it needs one. */
function Seed () {
  const { setTracks } = useLibrary()

  useEffect(() => {
    setTracks(library)
  }, [ setTracks ])

  return null
}

function fakeTransfer (payload: DragPayload) {
  const data = new Map([[ DND_MIME, JSON.stringify(payload) ]])
  return {
    effectAllowed: 'none',
    dropEffect:    'none',
    get types () {
      return [ ...data.keys() ]
    },
    setData: (type: string, value: string) => {
      data.set(type, value)
    },
    getData: (type: string) =>
      data.get(type) ?? '',
  } as unknown as DataTransfer
}

const dropOn = (element: HTMLElement, payload: DragPayload) =>
  fireEvent.drop(element, { dataTransfer: fakeTransfer(payload) })

const playlistZone = () =>
  screen.getByRole('region', { name: 'Playlists' })

describe('LibrarySidebar drops', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('turns a folder dropped on empty space into a playlist of its tracks', async () => {
    renderWithProviders(<><Seed /><LibrarySidebar /></>)

    dropOn(playlistZone(), { kind: 'folder', path: '/music/rock', label: 'rock' })

    // Named after what was dragged, holding the folder's two tracks.
    const created = await screen.findByRole('button', { name: /rock/ })
    expect(created).toHaveTextContent('2')
  })

  it('adds dropped tracks to the playlist they landed on, skipping duplicates', async () => {
    renderWithProviders(<><Seed /><LibrarySidebar /></>)

    dropOn(playlistZone(), { kind: 'tracks', trackIds: [ '/music/rock/one.mp3' ], label: 'One' })

    const playlist = await screen.findByRole('button', { name: /One/ })
    expect(playlist).toHaveTextContent('1')

    dropOn(playlist, {
      kind:     'tracks',
      trackIds: [ '/music/rock/one.mp3', '/music/jazz/three.mp3' ],
      label:    '2 tracks',
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /One/ })).toHaveTextContent('2'))
  })

  it('adds a whole album bucket when its heading is dropped', async () => {
    renderWithProviders(<><Seed /><LibrarySidebar /></>)

    dropOn(playlistZone(), { kind: 'group', grouping: 'artist', key: 'Artist', label: 'Artist' })

    const created = await screen.findByRole('button', { name: /Artist/ })
    expect(created).toHaveTextContent('3')
  })

  it('offers the queue and the last-played list', () => {
    renderWithProviders(<><Seed /><LibrarySidebar /></>)

    expect(screen.getByRole('button', { name: /Playback queue/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Last played/ })).toBeInTheDocument()
  })
})
