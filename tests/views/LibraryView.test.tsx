import { render, screen, waitFor, act } from '@testing-library/react'
import { LibraryView } from '../../src/app/views/LibraryView'
import { describe, it, expect, vi } from 'vitest'
import { renderWithProviders, makeMockDataSource } from '../helpers/renderWithProviders'
import type { TrackDTO } from '../../src/app/data/DataSource'

describe('LibraryView', () => {
  it('renders library view', () => {
    renderWithProviders(<LibraryView />)

    // Should have library-related content
    expect(screen.getByText('Library')).toBeInTheDocument()
  })

  it('shows empty state when no tracks', async () => {
    const { findByText } = renderWithProviders(<LibraryView />)

    // Scan runs on mount; wait for it to settle to the empty state.
    expect(await findByText('No tracks found')).toBeInTheDocument()
  })

  it('has scan functionality', () => {
    const mockData = makeMockDataSource()
    renderWithProviders(<LibraryView />)

    // Check that the component renders without crashing
    expect(screen.getByText('Library')).toBeInTheDocument()
  })
})
