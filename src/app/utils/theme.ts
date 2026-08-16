/**
 * A compact custom-theme recipe.
 *
 * The user chooses the three colours that carry meaning; the rest of the app
 * palette is derived with CSS color-mix so hover, focus and borders keep a
 * coherent relationship instead of becoming eighteen unrelated swatches.
 */
export interface CustomTheme {
  readonly version:         2
  readonly name:            string
  readonly background:      string
  readonly foreground:      string
  readonly accent:          string
  readonly borderIntensity: number
  readonly hoverIntensity:  number
  readonly focusIntensity:  number
}

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  version:         2,
  name:            'Custom Theme',
  background:      '#1a1a2e',
  foreground:      '#eeeeee',
  accent:          '#e94560',
  borderIntensity: 0.35,
  hoverIntensity:  0.45,
  focusIntensity:  0.6,
}

const HEX_COLOR = /^#[\da-f]{6}$/iu

function record (value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
}

function color (value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value)
    ? value
    : fallback
}

function intensity (value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

/** Coerces stored/imported recipes, including the old 18-swatch version. */
export function normalizeCustomTheme (value: unknown): CustomTheme {
  const raw    = record(value)
  const legacy = record(raw.colors)

  return {
    version:         2,
    name:            typeof raw.name === 'string' ? raw.name : DEFAULT_CUSTOM_THEME.name,
    background:      color(raw.background ?? legacy['--bg'], DEFAULT_CUSTOM_THEME.background),
    foreground:      color(raw.foreground ?? legacy['--text'], DEFAULT_CUSTOM_THEME.foreground),
    accent:          color(raw.accent ?? legacy['--accent'], DEFAULT_CUSTOM_THEME.accent),
    borderIntensity: intensity(raw.borderIntensity, DEFAULT_CUSTOM_THEME.borderIntensity),
    hoverIntensity:  intensity(raw.hoverIntensity, DEFAULT_CUSTOM_THEME.hoverIntensity),
    focusIntensity:  intensity(raw.focusIntensity, DEFAULT_CUSTOM_THEME.focusIntensity),
  }
}

function percent (value: number, low: number, high: number): string {
  return `${(low + (high - low) * intensity(value, 0)).toFixed(1)}%`
}

function luminance (hex: string): number {
  const value = hex.slice(1)
  const r     = Number.parseInt(value.slice(0, 2), 16)
  const g     = Number.parseInt(value.slice(2, 4), 16)
  const b     = Number.parseInt(value.slice(4, 6), 16)
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255
}

/** CSS variables resolved from one theme recipe. */
export function resolveCustomTheme (theme: CustomTheme): Record<string, string> {
  const t      = normalizeCustomTheme(theme)
  const border = percent(t.borderIntensity, 5, 32)
  const hover  = percent(t.hoverIntensity, 5, 20)
  const focus  = percent(t.focusIntensity, 45, 100)
  const raised = `color-mix(in srgb, ${t.foreground} 4%, ${t.background})`
  const input  = `color-mix(in srgb, ${t.foreground} 7%, ${t.background})`

  return {
    '--bg':              t.background,
    '--bg-raised':       raised,
    '--bg-input':        input,
    '--bg-hover':        `color-mix(in srgb, ${t.foreground} ${hover}, ${t.background})`,
    '--accent':          t.accent,
    '--accent-hover':    `color-mix(in srgb, ${t.foreground} ${percent(t.hoverIntensity, 8, 28)}, ${t.accent})`,
    '--accent-alt':      `color-mix(in srgb, ${t.background} 28%, ${t.accent})`,
    '--accent-contrast': luminance(t.accent) > 0.6 ? '#0a0a0e' : '#f4f4f8',
    '--accent-muted':    `color-mix(in srgb, ${t.accent} ${percent(t.focusIntensity, 8, 24)}, transparent)`,
    '--text':            t.foreground,
    '--text-dim':        `color-mix(in srgb, ${t.background} 22%, ${t.foreground})`,
    '--text-muted':      `color-mix(in srgb, ${t.background} 46%, ${t.foreground})`,
    '--border':          `color-mix(in srgb, ${t.foreground} ${border}, transparent)`,
    '--border-hover':    `color-mix(in srgb, ${t.foreground} ${percent(t.hoverIntensity, 12, 42)}, transparent)`,
    '--border-focus':    `color-mix(in srgb, ${t.accent} ${focus}, ${t.foreground})`,
    '--focus-ring':      `0 0 0 ${(1 + t.focusIntensity * 2).toFixed(1)}px var(--border-focus)`,
    '--wf-unplayed':     `color-mix(in srgb, ${t.foreground} ${border}, transparent)`,
    '--wf-played':       t.accent,
  }
}

export const CUSTOM_THEME_VARIABLES = Object.keys(
  resolveCustomTheme(DEFAULT_CUSTOM_THEME)
)
