export {
  UIProvider, useUI,
  MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH,
  clampSidebarWidth, isGridDensity,
  type OverlayName, type PlayerMode, type Density, type GridDensity, type Grouping, type BucketGrouping, type GroupScope,
} from './UIContext'

export {
  SettingsProvider, useSettings, useOptionalSettings,
  UI_FONT_STACKS, UI_FONT_LABELS, MIN_FONT_SCALE, MAX_FONT_SCALE,
  type RepeatMode, type Theme, type CustomTheme, type UiFont,
} from './SettingsContext'

export {
  DEFAULT_DSP, DSP_RANGES, EQ_BANDS, dspNodeValues, normalizeDsp,
  withEqGain, withFlatEq, withEqEnabled, withCompressor, withLimiter,
  type DspSettings, type DspChain, type DynamicsModule, type EqBand,
  type CompressorSettings, type LimiterSettings,
} from '../services/dspChain'

export { LibraryProvider, useLibrary, type Track, type FolderNode } from './LibraryContext'

export { AudioProvider, useAudio } from './AudioContext'
