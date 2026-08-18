/**
 * Applies the appearance settings that live outside the theme tokens: UI and
 * mono typeface, text scale, spacing density, corner style, the strength of the
 * ambient wash, and the accent colour.
 *
 * All of it is written as custom properties or `data-*` attributes on the
 * document root rather than through React, because they have to reach every
 * stylesheet at once — including the `@layer tokens` defaults, which nothing
 * renders.
 *
 * **This hook is the only writer of `--accent`.** When the accent is set to
 * follow the artwork, `useAmbientPalette` hands its palette in as a value; it
 * does not write the property itself. Two hooks writing one custom property on
 * one element is a race whose winner depends on effect ordering.
 *
 * Runs *after* `useThemeApply` on any given commit (that hook is mounted
 * deeper in the tree, and children flush their effects first), so the accent
 * chosen here wins over the defaults that hook restores.
 */
import { useEffect } from 'react'
import { UI_FONT_STACKS, UI_DISPLAY_STACKS, MONO_FONT_STACKS } from '../contexts/SettingsContext'
import type { Theme, UiFont, MonoFont, AccentSource, UiDensity, CornerStyle } from '../contexts/SettingsContext'
import { parseColor, contrastLift, toCss } from '../utils/color'
import type { Rgb } from '../utils/color'
import type { ArtPalette } from './useAmbientPalette'


/** Base root font size, in px, that a scale of 1 corresponds to. */
const BASE_FONT_PX = 16

/** Fallback page colours when `--bg` computes to something unparseable. */
const FALLBACK_BG_DARK: Rgb  = [ 10, 10, 14 ]
const FALLBACK_BG_LIGHT: Rgb = [ 244, 244, 248 ]

/** Above this perceived brightness, text on the accent goes dark. */
const CONTRAST_FLIP = 0.6

/**
 * Perceived brightness of a colour, 0–1, using the Rec. 601 weights. Good
 * enough to decide whether text on top of it should be black or white — which
 * is all `--accent-contrast` is for. Deliberately *not* WCAG relative
 * luminance: this is a "does it look light" question, not a contrast one.
 */
function perceivedBrightness ([ r, g, b ]: Rgb): number {
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255
}

interface Appearance {
  readonly theme:           Theme
  readonly uiFont:          UiFont
  readonly monoFont:        MonoFont
  readonly fontScale:       number
  readonly accent:          string
  readonly accentSource:    AccentSource
  readonly ambientStrength: number
  readonly uiDensity:       UiDensity
  readonly cornerStyle:     CornerStyle
  readonly artPalette:      ArtPalette | null
}

function applyFont (root: HTMLElement, uiFont: UiFont, monoFont: MonoFont): void {
  root.style.setProperty('--font', UI_FONT_STACKS[uiFont] ?? UI_FONT_STACKS.montserrat)
  root.style.setProperty('--font-display', UI_DISPLAY_STACKS[uiFont] ?? UI_DISPLAY_STACKS.montserrat)
  root.style.setProperty('--font-mono', MONO_FONT_STACKS[monoFont] ?? MONO_FONT_STACKS.system)
}

function applyScale (root: HTMLElement, fontScale: number): void {
  // Every `--text-*` token is in rem, so moving the root size moves the whole
  // type scale and nothing else — spacing and chrome stay put.
  root.style.fontSize = `${(BASE_FONT_PX * fontScale).toFixed(2)}px`
}

/**
 * Density and corner style are single-knob remaps in tokens.css
 * (`--sp-unit` and the radius trio), so applying them is just naming the knob.
 */
function applyChrome (
  root: HTMLElement,
  uiDensity: UiDensity,
  cornerStyle: CornerStyle,
  ambientStrength: number,
): void {
  root.setAttribute('data-ui-density', uiDensity)
  root.setAttribute('data-corners', cornerStyle)
  root.style.setProperty('--ambient-strength', ambientStrength.toFixed(2))
}

/**
 * The accent the page should use, which is either what the user picked or what
 * the record looks like.
 *
 * An artwork-derived accent has no designer standing behind it — a sleeve that
 * is almost entirely black hands back something nobody can see — so it goes
 * through `contrastLift` against the page's actual computed background before
 * it is allowed anywhere near the UI.
 */
function resolveAccent (
  root: HTMLElement,
  theme: Theme,
  accent: string,
  accentSource: AccentSource,
  artPalette: ArtPalette | null,
): string {
  if (accentSource !== 'artwork' || !artPalette)
    return accent

  const vibrant = parseColor(artPalette.vibrant)
  if (!vibrant)
    return accent

  // Read the background rather than assuming it: a custom theme, or a future
  // one, can put anything here, and the lift is only meaningful against the
  // surface the accent will actually sit on.
  const computed = getComputedStyle(root).getPropertyValue('--bg')
  const background = parseColor(computed)
    ?? (theme === 'light' ? FALLBACK_BG_LIGHT : FALLBACK_BG_DARK)

  return toCss(contrastLift(vibrant, background))
}

function applyAccent (root: HTMLElement, theme: Theme, accent: string): void {
  // A custom theme owns its own accent; overriding it here would make the
  // colour pickers in Settings silently ineffective.
  if (theme === 'custom')
    return

  const rgb = parseColor(accent)

  root.style.setProperty('--accent', accent)
  root.style.setProperty('--accent-hover', `color-mix(in srgb, ${accent} 75%, #fff)`)
  root.style.setProperty(
    '--accent-contrast',
    rgb && perceivedBrightness(rgb) > CONTRAST_FLIP ? '#0a0a0e' : '#f4f4f8',
  )
}

/**
 * See module docstring.
 *
 * One effect, not six. Every write targets the same element and is idempotent,
 * so splitting them by dependency bought nothing but extra subscriptions to the
 * same commit — and the order they run in is the ordering guarantee this hook
 * exists to provide.
 */
export function useAppearance ({
  theme,
  uiFont,
  monoFont,
  fontScale,
  accent,
  accentSource,
  ambientStrength,
  uiDensity,
  cornerStyle,
  artPalette,
}: Appearance) {
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes to `document.documentElement`, which no render can reach: these custom properties feed `@layer tokens`, which nothing renders.
  useEffect(() => {
    const root = document.documentElement

    applyFont(root, uiFont, monoFont)
    applyScale(root, fontScale)
    applyChrome(root, uiDensity, cornerStyle, ambientStrength)
    applyAccent(root, theme, resolveAccent(root, theme, accent, accentSource, artPalette))
  }, [
    theme,
    uiFont,
    monoFont,
    fontScale,
    accent,
    accentSource,
    ambientStrength,
    uiDensity,
    cornerStyle,
    artPalette,
  ])
}
