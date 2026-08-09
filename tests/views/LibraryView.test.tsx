import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LibraryView } from '../../src/app/views/LibraryView'
import { renderWithProviders } from '../helpers/renderWithProviders'


/** Settings hydrate from this key async — seed it before render so the
 * library isn't the "no folder configured" case these tests aren't after. */
function seedLibraryPath (path: string) {
  localStorage.setItem('desktop-audio-settings', JSON.stringify({ libraryPaths: [ path ]}))
}

describe('LibraryView', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('renders the labeled collection with its toolbar above it', async () => {
    seedLibraryPath('/mock/music-a')
    renderWithProviders(<LibraryView />)

    const library = screen.getByRole('region', { name: 'Library' })
    expect(library).toBeInTheDocument()

    // Grouping and density act on the list, so they live with it now.
    expect(screen.getByRole('group', { name: 'Group tracks by' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Collection layout' })).toBeInTheDocument()

    // `.library-toolbar` is a <header> scoped to the section, so it is generic
    // rather than a second banner landmark.
    expect(library.querySelector('.library-toolbar')?.tagName).toBe('HEADER')

    await screen.findByText('No tracks found')
  })

  it('offers five layouts: three row densities and two grid sizes', async () => {
    seedLibraryPath('/mock/music-a')
    renderWithProviders(<LibraryView />)

    const layout = screen.getByRole('group', { name: 'Collection layout' })
    for (const name of [ 'Compact rows', 'Normal rows', 'Relaxed rows', 'Small grid', 'Large grid' ])
      expect(within(layout).getByRole('radio', { name })).toBeInTheDocument()

    await screen.findByText('No tracks found')
  })

  it('shows the empty state after an empty scan', async () => {
    seedLibraryPath('/mock/music-b')
    renderWithProviders(<LibraryView />)

    expect(await screen.findByText('No tracks found')).toBeInTheDocument()
  })

  it('prompts to add a library folder when none is configured', async () => {
    renderWithProviders(<LibraryView />)

    expect(await screen.findByText('No library folder yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeInTheDocument()
  })
})
