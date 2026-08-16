import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CUSTOM_THEME,
  normalizeCustomTheme,
  resolveCustomTheme,
} from '../../src/app/utils/theme'


describe('custom theme recipe', () => {
  it('migrates the old swatch format into the compact recipe', () => {
    expect(normalizeCustomTheme({
      version: 1,
      name:    'Legacy',
      colors:  {
        '--bg':     '#101820',
        '--text':   '#f0f0f0',
        '--accent': '#ff3366',
      },
    })).toMatchObject({
      version:    2,
      name:       'Legacy',
      background: '#101820',
      foreground: '#f0f0f0',
      accent:     '#ff3366',
    })
  })

  it('derives interaction roles from the three colours and intensities', () => {
    const variables = resolveCustomTheme({
      ...DEFAULT_CUSTOM_THEME,
      borderIntensity: 1,
      hoverIntensity:  0,
      focusIntensity:  1,
    })

    expect(variables['--bg']).toBe(DEFAULT_CUSTOM_THEME.background)
    expect(variables['--text']).toBe(DEFAULT_CUSTOM_THEME.foreground)
    expect(variables['--accent']).toBe(DEFAULT_CUSTOM_THEME.accent)
    expect(variables['--border']).toContain('32.0%')
    expect(variables['--bg-hover']).toContain('5.0%')
    expect(variables['--focus-ring']).toContain('3.0px')
  })
})
