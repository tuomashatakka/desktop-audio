import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useAppearance } from '../../src/app/hooks/useAppearance'
import type { ArtPalette } from '../../src/app/hooks/useAmbientPalette'


interface Props {
  theme?:           string
  uiFont?:          string
  monoFont?:        string
  fontScale?:       number
  accent?:          string
  accentSource?:    string
  ambientStrength?: number
  uiDensity?:       string
  cornerStyle?:     string
  artPalette?:      ArtPalette | null
}

function Probe ({
  theme          = 'dark',
  uiFont         = 'montserrat',
  monoFont       = 'geist-mono',
  fontScale      = 1,
  accent         = '#00e5d1',
  accentSource   = 'custom',
  ambientStrength = 0.75,
  uiDensity      = 'comfortable',
  cornerStyle    = 'sharp',
  artPalette     = null,
}: Props) {
  useAppearance({
    theme:          theme as any,
    uiFont:         uiFont as any,
    monoFont:       monoFont as any,
    fontScale,
    accent,
    accentSource:   accentSource as any,
    ambientStrength,
    uiDensity:      uiDensity as any,
    cornerStyle:    cornerStyle as any,
    artPalette,
  })
  return null
}

const root = () => document.documentElement

afterEach(() => {
  root().style.removeProperty('--accent')
  root().style.removeProperty('--font-mono')
  root().style.removeProperty('--ambient-strength')
  root().removeAttribute('data-ui-density')
  root().removeAttribute('data-corners')
})

describe('useAppearance', () => {
  it('theme: custom leaves --accent untouched', () => {
    root().style.setProperty('--accent', 'SENTINEL')
    act(() => {
      render(<Probe theme='custom' />)
    })
    expect(root().style.getPropertyValue('--accent')).toBe('SENTINEL')
  })

  it('accentSource: custom writes the accent argument verbatim', () => {
    act(() => {
      render(<Probe accent='#ff0000' accentSource='custom' />)
    })
    expect(root().style.getPropertyValue('--accent')).toBe('#ff0000')
  })

  it('accentSource: artwork with a palette writes something different from the accent argument', () => {
    const palette: ArtPalette = {
      vibrant: 'rgb(200 50 50)',
      muted:   'rgb(100 50 50)',
      dark:    'rgb(20 10 10)',
      light:   'rgb(220 200 200)',
      lum:     0.3,
    }
    act(() => {
      render(<Probe accent='#00e5d1' accentSource='artwork' artPalette={palette} />)
    })
    // The accent is derived from the palette's vibrant, not the argument
    expect(root().style.getPropertyValue('--accent')).not.toBe('#00e5d1')
  })

  it('accentSource: artwork with null artPalette falls back to the argument', () => {
    act(() => {
      render(<Probe accent='#00e5d1' accentSource='artwork' artPalette={null} />)
    })
    expect(root().style.getPropertyValue('--accent')).toBe('#00e5d1')
  })

  it('writes data-ui-density, data-corners, --ambient-strength, and --font-mono', () => {
    act(() => {
      render(<Probe
        uiDensity='compact'
        cornerStyle='soft'
        ambientStrength={0.5}
        monoFont='departure'
      />)
    })
    expect(root().getAttribute('data-ui-density')).toBe('compact')
    expect(root().getAttribute('data-corners')).toBe('soft')
    expect(root().style.getPropertyValue('--ambient-strength')).toBe('0.50')
    expect(root().style.getPropertyValue('--font-mono')).toContain('Departure Mono')
  })
})
