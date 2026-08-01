import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useHeightTier, COMPACT_MAX_HEIGHT, MINI_MAX_HEIGHT } from '../../src/app/hooks/useHeightTier'

const ORIGINAL_HEIGHT = window.innerHeight

function Probe () {
  const tier = useHeightTier()
  return <span data-testid='tier'>{tier}</span>
}

function setHeight (height: number) {
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true })
}

function resizeTo (height: number) {
  act(() => {
    setHeight(height)
    window.dispatchEvent(new Event('resize'))
  })
}

describe('useHeightTier', () => {
  afterEach(() => {
    setHeight(ORIGINAL_HEIGHT)
  })

  it.each([
    [ 800, 'normal' ],
    [ COMPACT_MAX_HEIGHT, 'normal' ],
    [ COMPACT_MAX_HEIGHT - 1, 'compact' ],
    [ MINI_MAX_HEIGHT, 'compact' ],
    [ MINI_MAX_HEIGHT - 1, 'mini' ],
    [ 60, 'mini' ],
  ])('reports %ipx tall as the %s tier', (height, expected) => {
    setHeight(height)
    render(<Probe />)
    expect(screen.getByTestId('tier')).toHaveTextContent(expected)
  })

  it('updates as the window is resized across both thresholds', () => {
    setHeight(800)
    render(<Probe />)
    const tier = screen.getByTestId('tier')

    expect(tier).toHaveTextContent('normal')

    resizeTo(240)
    expect(tier).toHaveTextContent('compact')

    resizeTo(120)
    expect(tier).toHaveTextContent('mini')

    resizeTo(800)
    expect(tier).toHaveTextContent('normal')
  })
})
