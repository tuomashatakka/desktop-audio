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

vi.mock('../../src/app/views/DspView', () => ({
  DspView: () =>
    <div data-testid='dsp' />,
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
  /*
   * The player is the exception to "only the active overlay is mounted": it is
   * one component rendering one DOM in both the bar and the overlay, and it is
   * CSS that shows or hides it. The sheets stay conditional.
   */
  it('mounts no sheet while no overlay is open', () => {
    mocks.ui.overlay = null
    render(<OverlayHost />)

    expect(screen.queryByTestId('dsp')).toBeNull()
    expect(screen.queryByTestId('settings')).toBeNull()
    expect(screen.queryByTestId('tag-editor')).toBeNull()
  })

  it('keeps the player mounted whether or not its overlay is open', () => {
    mocks.ui.overlay = null
    const view = render(<OverlayHost />)

    expect(screen.getByTestId('player')).toBeInTheDocument()
    expect(document.querySelector('.player-overlay')).not.toHaveAttribute('open')

    mocks.ui.overlay = 'player'
    view.rerender(<OverlayHost />)

    expect(screen.getByTestId('player')).toBeInTheDocument()
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

  /*
   * The player owns its close button, grouped with the mode buttons in
   * `.player-actions`. Passing `closeButton` here as well rendered two.
   */
  it('leaves the player overlay without a close button of its own', () => {
    mocks.ui.overlay = 'player'
    render(<OverlayHost />)

    expect(document.querySelectorAll('.player-overlay .overlay-close')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('shows one sheet at a time', () => {
    mocks.ui.overlay = 'settings'
    render(<OverlayHost />)

    expect(screen.getByTestId('settings')).toBeInTheDocument()
    expect(screen.queryByTestId('dsp')).toBeNull()
    expect(screen.queryByTestId('tag-editor')).toBeNull()
  })

  // Audio processing is its own destination, not a layer over now playing:
  // sixteen faders never fitted above a transport that also had to stay put.
  it('gives audio processing its own sheet', () => {
    mocks.ui.overlay = 'dsp'
    render(<OverlayHost />)

    expect(screen.getByTestId('dsp')).toBeInTheDocument()
    expect(screen.queryByTestId('settings')).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('closes from its own close button', () => {
    mocks.ui.overlay = 'tag-editor'
    mocks.ui.closeOverlay.mockClear()
    render(<OverlayHost />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(mocks.ui.closeOverlay).toHaveBeenCalled()
  })
})
