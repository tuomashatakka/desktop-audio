import { render, screen } from '@testing-library/react'
import { SettingsView } from '../../src/app/views/SettingsView'
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../helpers/renderWithProviders'

describe('SettingsView', () => {
  it('renders settings view', () => {
    renderWithProviders(<SettingsView />)

    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
  })

  it('shows theme selection', () => {
    renderWithProviders(<SettingsView />)

    // Should have theme-related controls
    expect(screen.getByText(/theme/i)).toBeInTheDocument()
  })
})
