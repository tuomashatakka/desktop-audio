import { fireEvent, screen, within } from '@testing-library/react'
import { SettingsView } from '../../src/app/views/SettingsView'
import { describe, it, expect } from 'vitest'
import { renderWithProviders } from '../helpers/renderWithProviders'
import { keybindingStore } from '../../src/keybindings'

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
    expect(within(navigation).getByRole('link', { name: 'Hotkeys' })).toHaveAttribute('href', '#settings-hotkeys')
    expect(screen.getByRole('heading', { name: 'Playback' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument()
  })

  it('customizes, validates, and resets persisted keyboard shortcuts', () => {
    keybindingStore.reset()
    renderWithProviders(<SettingsView />)

    const nextTrack = screen.getByRole('textbox', { name: 'Next track (letter)' })
    fireEvent.keyDown(nextTrack, { key: 'x' })
    expect(nextTrack).toHaveValue('X')

    fireEvent.keyDown(nextTrack, { key: 'p' })
    expect(nextTrack).toHaveValue('X')
    expect(screen.getByText('That shortcut is already assigned.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset shortcuts' }))
    expect(nextTrack).toHaveValue('N')
  })

  it('keeps the custom theme editor mounted while toggling its visibility', () => {
    renderWithProviders(<SettingsView />)

    const editorHeading = screen.getByRole('heading', { name: 'Custom theme', hidden: true })
    const editor = editorHeading.parentElement
    expect(editor).toHaveAttribute('hidden')

    fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'custom' } })

    expect(editor).not.toHaveAttribute('hidden')
    expect(screen.getByLabelText(/main background/i)).toHaveAttribute('type', 'color')
    expect(screen.getByRole('slider', { name: /border intensity/i })).toHaveValue('0.35')
    expect(screen.getByRole('slider', { name: /hover intensity/i })).toHaveValue('0.45')
    expect(screen.getByRole('slider', { name: /focus intensity/i })).toHaveValue('0.6')
  })
})
