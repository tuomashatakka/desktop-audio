/**
 * Applies the appearance settings that live outside the theme tokens:
 * UI typeface, text scale, and the per-theme accent colour.
 *
 * All three are written as custom properties on the document root rather than
 * through React, because they have to reach every stylesheet at once —
 * including the `@layer tokens` defaults, which nothing renders.
 *
 * Runs *after* `useThemeApply` on any given commit (that hook is mounted
 * deeper in the tree, and children flush their effects first), so the accent
 * chosen here wins over the defaults that hook restores.
 */
import { useEffect } from 'react'
import { UI_FONT_STACKS, UI_DISPLAY_STACKS } from '../contexts/SettingsContext'
import type { Theme, UiFont } from '../contexts/SettingsContext'


/** Base root font size, in px, that a scale of 1 corresponds to. */
const BASE_FONT_PX = 16

/**
 * Perceived brightness of a `#rrggbb` colour, 0–1, using the Rec. 601
 * weights. Good enough to decide whether text on top of it should be black
 * or white — which is all `--accent-contrast` is for.
 */
function luminance (hex: string): number {
  const value = hex.replace('#', '')
  const full  = value.length === 3
    ? value.split('').map(c =>
      c + c)
      .join('')
    : value

  const r = Number.parseInt(full.slice(0, 2), 16) || 0
  const g = Number.parseInt(full.slice(2, 4), 16) || 0
  const b = Number.parseInt(full.slice(4, 6), 16) || 0
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255
}

interface Appearance {
  readonly theme:     Theme
  readonly uiFont:    UiFont
  readonly fontScale: number
  readonly accent:    string
}

function applyFont (root: HTMLElement, uiFont: UiFont): void {
  root.style.setProperty('--font', UI_FONT_STACKS[uiFont] ?? UI_FONT_STACKS.montserrat)
  root.style.setProperty('--font-display', UI_DISPLAY_STACKS[uiFont] ?? UI_DISPLAY_STACKS.montserrat)
}

function applyScale (root: HTMLElement, fontScale: number): void {
  // Every `--text-*` token is in rem, so moving the root size moves the whole
  // type scale and nothing else — spacing and chrome stay put.
  root.style.fontSize = `${(BASE_FONT_PX * fontScale).toFixed(2)}px`
}

function applyAccent (root: HTMLElement, theme: string, accent: string): void {
  // A custom theme owns its own accent; overriding it here would make the
  // colour pickers in Settings silently ineffective.
  if (theme === 'custom')
    return

  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-hover', `color-mix(in srgb, ${accent} 75%, #fff)`)
  root.style.setProperty('--accent-contrast', luminance(accent) > 0.6 ? '#0a0a0e' : '#f4f4f8')
}

/**
 * See module docstring.
 *
 * One effect, not three. All three writes target the same element and are
 * idempotent, so splitting them by dependency bought nothing but two extra
 * subscriptions to the same commit — and the order they run in is the ordering
 * guarantee this hook exists to provide.
 */
export function useAppearance ({ theme, uiFont, fontScale, accent }: Appearance) {
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes to `document.documentElement`, which no render can reach: these custom properties feed `@layer tokens`, which nothing renders.
  useEffect(() => {
    const root = document.documentElement

    applyFont(root, uiFont)
    applyScale(root, fontScale)
    applyAccent(root, theme, accent)
  }, [ theme, uiFont, fontScale, accent ])
}
