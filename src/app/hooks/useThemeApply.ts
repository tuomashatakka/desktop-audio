import { useEffect } from 'react'
import type { CustomTheme } from '../contexts/SettingsContext'


export function useThemeApply (theme: string, customTheme: CustomTheme | null) {
  useEffect(() => {
    const root = document.documentElement

    if (theme === 'custom' && customTheme)
      for (const [ key, value ] of Object.entries(customTheme.colors))
        root.style.setProperty(key, value)
    else {
      // Remove custom properties to let CSS variables from main.css take over
      const defaultVars = [
        '--bg', '--bg-raised', '--bg-input', '--bg-hover',
        '--accent', '--accent-hover', '--accent-alt',
        '--text', '--text-dim', '--text-muted',
        '--border', '--border-hover',
        '--success', '--warning', '--danger', '--info',
        '--wf-unplayed', '--wf-played',
      ]
      for (const v of defaultVars)
        root.style.removeProperty(v)
    }
  }, [ theme, customTheme ])
}
