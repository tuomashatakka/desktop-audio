import { screen } from '@testing-library/react'
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

  it('renders the labeled track collection', async () => {
    seedLibraryPath('/mock/music-a')
    renderWithProviders(<LibraryView />)

    expect(screen.getByRole('region', { name: 'Library tracks' })).toBeInTheDocument()
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
