import { render, screen } from '@testing-library/react'
import { SettingsView } from '../../src/app/views/SettingsView'
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../helpers/renderWithProviders'

describe('SettingsView', () => {
  it('renders settings view', () => {
    renderWithProviders(<SettingsView />)

    // Should have the Library section visible by default - check for the heading
    expect(screen.getByRole('heading', { name: /library/i })).toBeInTheDocument()
  })

  it('renders without crashing', () => {
    renderWithProviders(<SettingsView />)
    
    // Check that the component renders
    expect(screen.getByText(/library/i)).toBeInTheDocument()
  })
})
