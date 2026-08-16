import { useEffect } from 'react'
import type { CustomTheme } from '../contexts/SettingsContext'
import { CUSTOM_THEME_VARIABLES, resolveCustomTheme } from '../utils/theme'


export function useThemeApply (theme: string, customTheme: CustomTheme | null) {
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes the theme custom properties onto the document root.
  useEffect(() => {
    const root = document.documentElement

    for (const variable of CUSTOM_THEME_VARIABLES)
      root.style.removeProperty(variable)

    if (theme === 'custom' && customTheme)
      for (const [ variable, value ] of Object.entries(resolveCustomTheme(customTheme)))
        root.style.setProperty(variable, value)
  }, [ theme, customTheme ])
}
