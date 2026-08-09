import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LibraryGrid } from '../../../src/app/components/composite/LibraryGrid'
import type { Track } from '../../../src/app/contexts'


function track (over: Partial<Track> & { id: string }): Track {
  return {
    path:       `/music/${over.id}.mp3`,
    title:      over.id,
    artist:     'Radiohead',
    album:      'Kid A',
    duration:   180,
    format:     'mp3',
    size:       1000,
    coverColor: '#123456',
    ...over,
  } as Track
}

const TRACKS = [
  track({ id: 'a' }),
  track({ id: 'b' }),
  track({ id: 'c', album: 'Amnesiac' }),
]

describe('LibraryGrid', () => {
  it('renders one card per bucket, with the heading still a heading', () => {
    render(
      <LibraryGrid
        tracks={ TRACKS }
        grouping='album'
        density='grid-sm'
        onOpen={ vi.fn() }
        onPlay={ vi.fn() } />
    )

    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Kid A' })).toBeInTheDocument()
    expect(screen.getByText('Radiohead · 2 tracks')).toBeInTheDocument()
  })

  it('drills into the bucket that was clicked', () => {
    const onOpen = vi.fn()
    render(
      <LibraryGrid
        tracks={ TRACKS }
        grouping='album'
        density='grid-sm'
        onOpen={ onOpen }
        onPlay={ vi.fn() } />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Kid A' }))

    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ grouping: 'album', label: 'Kid A' })
    )
  })

  it('queues the whole bucket from its play button, not just one track', () => {
    const onPlay = vi.fn()
    render(
      <LibraryGrid
        tracks={ TRACKS }
        grouping='album'
        density='grid-sm'
        onOpen={ vi.fn() }
        onPlay={ onPlay } />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play Kid A' }))

    expect(onPlay).toHaveBeenCalledWith([ TRACKS[0], TRACKS[1] ], 0)
  })

  it('keeps the play button a sibling of the open button, never a child', () => {
    const { container } = render(
      <LibraryGrid
        tracks={ TRACKS }
        grouping='album'
        density='grid-sm'
        onOpen={ vi.fn() }
        onPlay={ vi.fn() } />
    )

    // A button inside a button is invalid and gets unnested by the parser.
    expect(container.querySelector('button button')).toBeNull()
  })

  it('shows one card per track when ungrouped, and playing is the open action', () => {
    const onPlay = vi.fn()
    render(
      <LibraryGrid
        tracks={ TRACKS }
        grouping='none'
        density='grid-lg'
        onOpen={ vi.fn() }
        onPlay={ onPlay } />
    )

    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /^Play / })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'b' }))
    expect(onPlay).toHaveBeenCalledWith(TRACKS, 1)
  })

  it('carries the card size as a data attribute rather than a second rule set', () => {
    const { container, rerender } = render(
      <LibraryGrid
        tracks={ TRACKS }
        grouping='album'
        density='grid-sm'
        onOpen={ vi.fn() }
        onPlay={ vi.fn() } />
    )

    expect(container.querySelector('.library-grid')).toHaveAttribute('data-size', 'sm')

    rerender(
      <LibraryGrid
        tracks={ TRACKS }
        grouping='album'
        density='grid-lg'
        onOpen={ vi.fn() }
        onPlay={ vi.fn() } />
    )

    expect(container.querySelector('.library-grid')).toHaveAttribute('data-size', 'lg')
  })
})
