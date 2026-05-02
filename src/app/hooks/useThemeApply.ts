import { useEffect } from 'react'
import type { CustomTheme } from '../contexts/SettingsContext'

export function useThemeApply (theme: string, customTheme: CustomTheme | null) {
  useEffect(() => {
    const root = document.documentElement

    if (theme === 'custom' && customTheme) {
      // Apply all custom theme colors
      Object.entries(customTheme.colors).forEach(([key, value]) => {
        root.style.setProperty(key, value)
      })
    } else {
      // Remove custom properties to let CSS variables from main.css take over
      const defaultVars = [
        '--bg', '--bg-raised', '--bg-input', '--bg-hover',
        '--accent', '--accent-hover', '--accent-alt',
        '--text', '--text-dim', '--text-muted',
        '--border', '--border-hover',
        '--success', '--warning', '--danger', '--info',
        '--wf-unplayed', '--wf-played',
      ]
      defaultVars.forEach(v => root.style.removeProperty(v))
    }
  }, [theme, customTheme])
}
