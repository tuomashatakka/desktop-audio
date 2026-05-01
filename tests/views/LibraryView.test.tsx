import { render, screen } from '@testing-library/react'
import { LibraryView } from '../../src/app/views/LibraryView'
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../helpers/renderWithProviders'

describe('LibraryView', () => {
  it('renders library view', () => {
    renderWithProviders(<LibraryView />)

    // Should have library-related content
    expect(screen.getByText('Library')).toBeInTheDocument()
  })

  it('shows empty state when no tracks', () => {
    renderWithProviders(<LibraryView />)

    // When no tracks, should show empty state
    expect(screen.getByText('No tracks found')).toBeInTheDocument()
  })
})
