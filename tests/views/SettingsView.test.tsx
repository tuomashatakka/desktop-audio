import { fireEvent, screen, within } from '@testing-library/react'
import { SettingsView } from '../../src/app/views/SettingsView'
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../helpers/renderWithProviders'

describe('SettingsView', () => {
  it('renders settings view', () => {
    renderWithProviders(<SettingsView />)

    expect(screen.getByRole('heading', { name: /library/i })).toBeInTheDocument()
  })

  it('keeps every settings section mounted behind native hash navigation', () => {
    renderWithProviders(<SettingsView />)

    const navigation = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(navigation).getByRole('link', { name: 'Library' })).toHaveAttribute('href', '#settings-library')
    expect(within(navigation).getByRole('link', { name: 'Appearance' })).toHaveAttribute('href', '#settings-appearance')
    expect(screen.getByRole('heading', { name: 'Playback' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
  })

  it('keeps the custom theme editor mounted while toggling its visibility', () => {
    renderWithProviders(<SettingsView />)

    const editorHeading = screen.getByRole('heading', { name: 'Custom Theme Colors', hidden: true })
    const editor = editorHeading.parentElement
    expect(editor).toHaveAttribute('hidden')

    fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'custom' } })

    expect(editor).not.toHaveAttribute('hidden')
  })
})
