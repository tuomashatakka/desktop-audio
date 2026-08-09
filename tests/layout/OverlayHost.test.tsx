import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OverlayHost } from '../../src/app/layout/OverlayHost'


const mocks = vi.hoisted(() => ({
  ui: { overlay: null as string | null, closeOverlay: vi.fn() },
}))

vi.mock('../../src/app/contexts', () => ({
  useUI: () =>
    mocks.ui,
}))

vi.mock('../../src/app/components/composite/Player', () => ({
  Player: ({ expanded }: { expanded?: boolean }) =>
    <div data-testid='player' data-expanded={ expanded ? '' : undefined } />,
}))

vi.mock('../../src/app/views/SettingsView', () => ({
  SettingsView: () =>
    <div data-testid='settings' />,
}))

vi.mock('../../src/app/views/TagEditorView', () => ({
  TagEditorView: () =>
    <div data-testid='tag-editor' />,
}))

describe('OverlayHost', () => {
  it('mounts nothing while no overlay is open', () => {
    mocks.ui.overlay = null
    render(<OverlayHost />)

    expect(screen.queryByTestId('player')).toBeNull()
    expect(screen.queryByTestId('settings')).toBeNull()
    expect(screen.queryByTestId('tag-editor')).toBeNull()
  })

  it('renders the now-playing player expanded, in a full-bleed dialog', () => {
    mocks.ui.overlay = 'player'
    render(<OverlayHost />)

    expect(screen.getByTestId('player')).toHaveAttribute('data-expanded')

    const dialog = document.querySelector('.player-overlay')
    expect(dialog).toHaveAttribute('data-variant', 'full')
    // Light dismiss: Escape and a backdrop click both close it.
    expect(dialog).toHaveAttribute('closedby', 'any')
  })

  it('shows one overlay at a time', () => {
    mocks.ui.overlay = 'settings'
    render(<OverlayHost />)

    expect(screen.getByTestId('settings')).toBeInTheDocument()
    expect(screen.queryByTestId('player')).toBeNull()
    expect(screen.queryByTestId('tag-editor')).toBeNull()
  })

  it('closes from its own close button', () => {
    mocks.ui.overlay = 'tag-editor'
    mocks.ui.closeOverlay.mockClear()
    render(<OverlayHost />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mocks.ui.closeOverlay).toHaveBeenCalled()
  })
})
