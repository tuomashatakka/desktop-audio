import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { keybindingStore } from '../../src/keybindings'
import { useKeyboardShortcuts } from '../../src/app/hooks/useKeyboardShortcuts'


const mocks = vi.hoisted(() => {
  const audio = {
    isPlaying:   true,
    currentTrack: { id: 'track-1' },
    volume:      0.5,
    pause:       vi.fn(),
    resume:      vi.fn(),
    setVolume:   vi.fn(),
    playNext:    vi.fn(),
    playPrevious: vi.fn(),
  }
  const ui = {
    currentView:  'library',
    previousView: null,
    sidebarOpen:  false,
    setView:      vi.fn(),
    toggleSidebar: vi.fn(),
  }
  return {
    audio,
    ui,
    library: { filteredTracks: [{ id: 'track-1' }] },
    host: {
      onMediaPlayPause: vi.fn(() =>
        vi.fn()),
      onMediaNext: vi.fn(() =>
        vi.fn()),
      onMediaPrev: vi.fn(() =>
        vi.fn()),
    },
  }
})

vi.mock('../../src/app/contexts', () => ({
  useAudio: () =>
    mocks.audio,
  useLibrary: () =>
    mocks.library,
  useUI: () =>
    mocks.ui,
}))

vi.mock('../../src/app/data', () => ({
  useHost: () =>
    mocks.host,
}))

function Harness () {
  useKeyboardShortcuts()
  return <input aria-label='Editor' />
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    keybindingStore.reset()
    mocks.ui.currentView = 'library'
    mocks.ui.sidebarOpen = false
  })

  it('handles both letter and platform next/previous shortcuts', () => {
    render(<Harness />)

    fireEvent.keyDown(window, { key: 'n' })
    fireEvent.keyDown(window, { key: 'p' })
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'ArrowLeft', metaKey: true })

    expect(mocks.audio.playNext).toHaveBeenCalledTimes(2)
    expect(mocks.audio.playPrevious).toHaveBeenCalledTimes(2)
  })

  it('opens app views and toggles the side menu with modifier shortcuts', () => {
    render(<Harness />)

    fireEvent.keyDown(window, { key: ',', metaKey: true })
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'p', metaKey: true })
    fireEvent.keyDown(window, { key: 'e', ctrlKey: true })

    expect(mocks.ui.setView).toHaveBeenNthCalledWith(1, 'settings')
    expect(mocks.ui.setView).toHaveBeenNthCalledWith(2, 'library')
    expect(mocks.ui.setView).toHaveBeenNthCalledWith(3, 'player')
    expect(mocks.ui.toggleSidebar).toHaveBeenCalledOnce()
  })

  it('applies custom bindings instantly and leaves text editing alone', () => {
    render(<Harness />)
    act(() => {
      expect(keybindingStore.updateBinding('next-track-letter', 'x')).toBe(true)
    })

    const editor = document.querySelector('input')!
    fireEvent.keyDown(window, { key: 'x' })
    fireEvent.keyDown(editor, { key: 'x' })
    fireEvent.keyDown(editor, { key: 'l', metaKey: true })

    expect(mocks.audio.playNext).toHaveBeenCalledOnce()
    expect(mocks.ui.setView).toHaveBeenCalledWith('library')
  })
})
