import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibraryView } from '../../src/app/views/LibraryView'
import { renderWithProviders } from '../helpers/renderWithProviders'


describe('LibraryView', () => {
  it('renders the labeled track collection', async () => {
    renderWithProviders(<LibraryView />)

    expect(screen.getByRole('region', { name: 'Library tracks' })).toBeInTheDocument()
    await screen.findByText('No tracks found')
  })

  it('shows the empty state after an empty scan', async () => {
    renderWithProviders(<LibraryView />)

    expect(await screen.findByText('No tracks found')).toBeInTheDocument()
  })

})
