# DSP Processing — 16-band EQ, compressor, limiter

> **Shipped.** Five things changed during implementation, all of them
> corrections to this plan rather than scope changes:
>
> 1. **Bypass is neutral parameters, not rewiring.** The plan's `rewire()` was
>    wrong: Chromium's `DynamicsCompressorNode` has an unconditional ~6 ms
>    pre-delay regardless of its parameters, so splicing one out shifts the
>    sample stream in time — a click no ramp can hide. (The plan's ramp was also
>    decorative: `setTargetAtTime` approaches asymptotically, but the
>    `disconnect()` fired synchronously while gain was still ~1.) A biquad at
>    0 dB and a compressor at ratio 1 are both bit-exact unity, so neutral
>    params cost nothing and the whole 8-combination test matrix disappeared.
> 2. **The shelves moved off the band centres.** At the nominal 20 Hz / 20 kHz
>    the two end faders were inaudible — a shelf's `frequency` is its corner, so
>    it belongs at the band *edge*: √(20 × 31.5) ≈ 25 Hz and
>    √(12500 × 20000) ≈ 15.8 kHz. `Q` is not set on shelves at all; the spec
>    ignores it.
> 3. **`AudioContext` exposes `reductionOf(module)`, not the chain object.**
>    Smaller surface, no `useState`, and a view cannot call `dispose()`.
> 4. **One `updateDsp` setter, not five.** The DSP-shaped knowledge lives in
>    `dspChain.ts` as `with*` combinators, so `SettingsContext` never learns
>    what an EQ band is. Normalisation runs on the way in as well as on hydrate.
> 5. **`Knob`/`Fader` are one module** (`ParamControl.tsx`) with two exported
>    variants — the pattern `DESIGN_GUIDE.md` asks for — and the visible shape is
>    a decorative span under a transparent range, matching `.waveform-input`.
>
> Also: `tests/setup.ts`'s mock gap was real and step 1 defused it. The
> `playerMode` lift landed. Two lint traps turned up that the plan did not
> predict — `react-strict/jsx-prop-layout` *crashes* on a JSX prop named exactly
> `on`, and on spreads it wants regular props first.

## Context

`src/app/layout/LibrarySidebar.tsx:138-150` holds a deliberately `disabled`
button labelled *"DSP processing — coming soon"*, added alongside the frequency
matrix in `73166dc`. It reserves the slot; nothing behind it exists. The live
audio graph has no processing stage at all:

```
<audio> → MediaElementAudioSourceNode → AnalyserNode(4096) → destination
```

(`AudioContext.tsx:340-366`. Note there is **no** `GainNode`, despite that file's
own docblock claiming one — volume is `audioRef.current.volume`, set in the
effect at `AudioContext.tsx:313-317`. And `src/app/services/audioEngine.ts` is
orphaned dead code that nothing imports; **leave it untouched**, it is not the
graph and touching it is unrelated churn.)

This plan inserts a real processing chain into that graph and adds a panel that
drives it: a 16-band graphic equaliser, a compressor
(threshold / ratio / attack / release) and a limiter (threshold / release), each
module independently bypassable.

### Decisions taken

| Question | Answer |
|---|---|
| Placement | **4th player mode** — `PlayerMode` gains `'dsp'`, a button in `.player-actions`, the panel chosen in `PlayerPanel`. Overlay only, like lyrics and the spectrum. |
| Limiter | A second `DynamicsCompressorNode` with `ratio` 20, `knee` 0, `attack` 0.001 welded; only threshold + release exposed. |
| Controls | 16 vertical faders for the EQ (the graphic-EQ idiom — the curve reads at a glance); rotary knobs for the 6 dynamics params. |
| State | One global `dsp` object in `SettingsContext`, persisted through the existing `update()` setter. |

---

## The EQ band table

16 bands on the ISO 2/3-octave series (ratio `2^(2/3)` ≈ 1.587), which lands
exactly 16 centres across the audible range:

| # | Hz | type | # | Hz | type |
|---|---|---|---|---|---|
| 0 | 20 | `lowshelf` | 8 | 800 | `peaking` |
| 1 | 31.5 | `peaking` | 9 | 1250 | `peaking` |
| 2 | 50 | `peaking` | 10 | 2000 | `peaking` |
| 3 | 80 | `peaking` | 11 | 3150 | `peaking` |
| 4 | 125 | `peaking` | 12 | 5000 | `peaking` |
| 5 | 200 | `peaking` | 13 | 8000 | `peaking` |
| 6 | 315 | `peaking` | 14 | 12500 | `peaking` |
| 7 | 500 | `peaking` | 15 | 20000 | `highshelf` |

Shelves at the extremes rather than peaking filters, so the bottom and top
faders move everything below/above them instead of carving a bump with
inaudible air on the far side.

This is the ISO 1/3-octave preferred series taken every other step, so the labels
are the ones printed on real hardware rather than numbers we invented.

**Clamp the assigned frequency to `Math.min(hz, ctx.sampleRate * 0.45)`.** The top
band's nominal 20 kHz sits close to Nyquist on 44.1 kHz material, where biquad
coefficients degrade; worse, a 48 kHz-assuming constant would be plain invalid if
the device opens at 22.05 kHz. The *label* stays 20 kHz either way — only the
coefficient is clamped.

`BAND_Q = 1.4`, one named constant. The width-matched value for a 2/3-octave
band is `√(2^N)/(2^N−1)` ≈ **2.15**, but that is the right Q for *isolated*
bands: on a graphic EQ where neighbours are boosted together, 2.15 leaves
audible ripple between centres. 1.4 overlaps deliberately so adjacent faders sum
into a smooth curve. One constant, so it is one edit if you disagree.

---

## Control ranges

The UI stores and displays **dB and milliseconds**. `DynamicsCompressorNode`
takes attack and release in **seconds**, so `apply()` divides by 1000 — that
conversion lives in exactly one place, and is the thing the unit test pins.

| Module | Param | Range | Step | Default | Node units |
|---|---|---|---|---|---|
| EQ | `gains[0..15]` | −12…+12 dB | 0.5 | 0 | dB (direct) |
| Compressor | threshold | −60…0 dB | 1 | −24 | dB (direct) |
| Compressor | ratio | 1…20 : 1 | 0.5 | 4 | direct |
| Compressor | attack | 0…200 ms | 1 | 3 | **÷1000** |
| Compressor | release | 10…1000 ms | 5 | 250 | **÷1000** |
| Limiter | threshold | −24…0 dB | 0.5 | −1 | dB (direct) |
| Limiter | release | 10…500 ms | 5 | 50 | **÷1000** |

Welded on the limiter: `ratio` 20, `knee` 0, `attack` 0.001. The compressor's
`knee` is fixed at 6 dB — the Web Audio default of 30 dB is so soft that the
ratio knob barely reads as doing anything.

All three modules default to **off**, so installing this changes nobody's sound
until they ask for it.

---

## Implementation, in dependency order

### 1. `tests/setup.ts` — grow the AudioContext mock *first*

**This is step one because skipping it turns the whole suite red for reasons
that look nothing like DSP.** The mock at `tests/setup.ts:82-96` only implements
`createAnalyser`, `createMediaElementSource`, `destination` and `close`. As soon
as `setupAnalyzer()` calls `createBiquadFilter()`, every existing test that loads
a track throws `not a function`.

Add to the mock factory:

- `currentTime: 0` — `setTargetAtTime(v, ctx.currentTime, τ)` would otherwise
  pass `undefined`.
- `createGain()` → `{ gain: audioParam(), connect, disconnect }`
- `createBiquadFilter()` → `{ type: 'peaking', frequency: audioParam(), Q: audioParam(), gain: audioParam(), connect, disconnect }`
- `createDynamicsCompressor()` → `{ threshold, knee, ratio, attack, release }` as
  AudioParams, plus `reduction: 0`, `connect`, `disconnect`.

where `audioParam()` is a tiny local helper returning
`{ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() }`. Keep it a
factory, not a shared object — sixteen filters sharing one `gain` param would
make the band tests pass for the wrong reason.

### 2. `src/app/services/dspChain.ts` — new, no React

The whole DSP brain. Pure module, so it is testable without a renderer.

```ts
export interface EqSettings         { readonly on: boolean, readonly gains: readonly number[] }
export interface CompressorSettings { readonly on: boolean, readonly threshold: number,
                                      readonly ratio: number, readonly attack: number,
                                      readonly release: number }
export interface LimiterSettings    { readonly on: boolean, readonly threshold: number,
                                      readonly release: number }

export interface DspSettings {
  readonly eq:         EqSettings
  readonly compressor: CompressorSettings
  readonly limiter:    LimiterSettings
}

/** ISO 2/3-octave centres. Index is the fader index. */
export const EQ_BANDS: readonly number[]
export const BAND_Q: number
export const EQ_GAIN_LIMIT: number          // 12
export const DEFAULT_DSP: DspSettings

export interface DspChain {
  readonly input:  AudioNode            // connect the source here
  readonly output: AudioNode             // connect the analyser here
  apply (dsp: DspSettings): void         // params + rewire, idempotent
  reduction (): { compressor: number, limiter: number }
  dispose (): void
}

export function createDspChain (ctx: BaseAudioContext): DspChain
export function normalizeDsp (value: unknown): DspSettings
```

Internals:

- **A stable spine of two `GainNode`s**, `input` and `output`, created once and
  never rewired themselves. Everything downstream connects between them. This is
  what lets `AudioContext`'s graph wiring be write-once: `setupAnalyzer()`
  connects `source → input` and `output → analyser` one time, and never has to
  know that a module was toggled.
- **Bypass is genuine rewiring, not neutral params.** `rewire()` disconnects
  `input` and each module's tail, then reconnects only the enabled modules in
  order `input → eq → comp → lim → output`. Neutralising params instead would
  leave 16 biquads in the path contributing phase shift while the UI claims the
  EQ is off, which is a lie. Guard it: `rewire()` compares against the last
  applied on/off triple and returns early when nothing changed, so dragging a
  knob never re-plumbs the graph.
- **Toggling can click**, because a discontinuity in the signal is a
  discontinuity. Ramp `output.gain` down to 0 over ~15 ms with
  `setTargetAtTime`, rewire, ramp back. Cheap, and toggles are rare.
- **Every param write goes through `setTargetAtTime(v, ctx.currentTime, 0.01)`,
  never `.value =`.** Direct assignment on a live graph zippers audibly while a
  fader is being dragged. The one exception is the welded limiter constants,
  written once at construction.
- `reduction()` reads `compressorNode.reduction` / `limiterNode.reduction` —
  plain readonly numbers, not AudioParams, so the panel must poll them in a RAF
  loop rather than subscribe.
- `normalizeDsp` is the hydration guard — see step 3.

### 3. `src/app/contexts/SettingsContext.tsx`

- `dsp: DspSettings` into the `Settings` interface (lines 81-101) and
  `defaultSettings` (144-158), sourced from `DEFAULT_DSP`.
- Setters, each a one-liner over the existing `update()`:
  `setEqGain(index, db)`, `setEqEnabled(on)`, `setCompressor(patch)`,
  `setLimiter(patch)`, `resetDsp()`. Patch-shaped for the dynamics so one knob
  drag is one setter call, not four. Add them to `SettingsContextValue` and to
  the memoized value.
- **`loadSettings()` at 379-399 shallow-merges** —
  `{ ...defaultSettings, ...JSON.parse(stored) }`. A stored `dsp` therefore
  replaces the default subtree wholesale, so a build that predates a field, or a
  hand-edited `localStorage`, yields a `dsp` with missing keys or an `eq.gains`
  of the wrong length — and a wrong-length array silently leaves trailing bands
  unwritten. Pipe it through the guard:
  `return normalizeDsp === applied → { ...defaultSettings, ...parsed, dsp: normalizeDsp(parsed.dsp) }`.
  `normalizeDsp` clamps every number to its documented range and pads/truncates
  `gains` to `EQ_BANDS.length`. It lives in `dspChain.ts`, next to the ranges it
  enforces, so the clamp cannot drift from the constants.
- Export `type DspSettings` and the new setters through
  `src/app/contexts/index.ts`.

### 4. `src/app/contexts/AudioContext.tsx`

- `const dspRef = useRef<DspChain | null>(null)` and
  `const [dspChain, setDspChain] = useState<DspChain | null>(null)` beside the
  existing `analyzer` pair at 243-247 — same shape, same reason: the ref for the
  audio callbacks, the state so the panel re-renders when it appears.
- `const dsp = settings?.dsp ?? DEFAULT_DSP` next to the existing
  `settings?.repeatMode` reads at 239-241. Playback must still work without a
  `SettingsProvider`, which is why `useOptionalSettings` is used there.
- In `setupAnalyzer()` (340-366), build the chain before wiring the source and
  splice it in:

  ```
  source → dsp.input → [eq] → [comp] → [lim] → dsp.output → analyser → destination
  ```

  The analyser stays immediately before `destination`, so **the spectrum panel
  shows post-DSP audio** — move an EQ fader with the visualizer open and you
  watch it happen. That is the right way round; analysing pre-DSP would show you
  the file, not the output.
- One effect to push live changes, sited next to the volume effect at 313-317
  and carrying the mandatory justification comment:

  ```ts
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Writes DSP parameters onto live Web Audio nodes, which React does not own.
  useEffect(() => {
    dspRef.current?.apply(dsp)
  }, [ dsp ])
  ```

  `apply()` must therefore be idempotent and cheap: `dsp` is a fresh object
  after every setter call, so this effect runs on every knob tick.
- Add `dspChain` to the memoized context value (~588) alongside `analyzer`, and
  to `AudioContextValue` — directly after `readonly analyzer: AnalyserNode | null`
  at line 60. The panel needs the node handle for its
  gain-reduction meters — exactly how `FrequencyMatrix` gets its `AnalyserNode`.

### 5. `src/app/components/atomic/Knob.tsx` and `Fader.tsx` — new

Both wrap a native `<input type='range'>`, which is the whole point: `role="slider"`,
`aria-valuenow`, arrow/Home/End keys, focus ring and pointer drag all come from
the platform, exactly as `SegmentedControl` and `Rating` take radio semantics
from `<fieldset>` + radios rather than reimplementing them.

```ts
interface KnobProps {
  readonly label:  string          // visible <span>, and the input's label
  readonly value:  number
  readonly min:    number
  readonly max:    number
  readonly step?:  number
  readonly unit?:  string          // 'dB' | 'ms' | ':1'
  readonly format?: (value: number) => string
  readonly onChange: (value: number) => void
}
```

`Fader` takes the same props. Markup for both is
`<label class='knob'> <span class='knob-label'> + <input type='range'> + <output class='knob-value'> </label>` —
the wrapping label is what names the slider, so no `aria-label` is needed and
the readout is an `<output>`, matching the `.volume-setting` / `.volume-value`
pattern at `SettingsView.tsx:226-242`.

The rotary look comes from one custom property:
`style={{ '--knob-turn': (value - min) / (max - min) } as CSSProperties}`,
the established idiom (`FolderTree.tsx:50` `--level`, `AppLayout.tsx:34`
`--sidebar-w`). CSS turns that 0-1 ratio into a `conic-gradient` arc and a
`rotate` on the indicator. `Fader` uses the same ratio for its fill.

Export both from `src/app/components/atomic/index.ts`.

### 6. `src/app/components/composite/DspPanel.tsx` — new

Sits in `composite/` beside `FrequencyMatrix.tsx`, its sibling in every respect.

```ts
interface DspPanelProps {
  readonly chain:  DspChain | null
  readonly active: boolean
}
```

- Root is `<section className='dsp-panel' aria-label='DSP processing'>` →
  `role="region"` with a name, which is how the existing panel tests find
  `FrequencyMatrix` (`aria-label='Frequency spectrum'`, `FrequencyMatrix.tsx:327`).
- Three `<fieldset>`s, each `<legend>` + a native
  `<input type='checkbox' role='switch'>` for enable/bypass, styled as a switch.
  A checkbox with `role="switch"` is the on/off idiom; do not build a
  `<button aria-pressed>` when the platform has the control.
- The EQ fieldset is a `<ul>` of 16 `<li>` faders, plus a **Flat** reset button
  (`<Button variant='ghost'>`) — 16 faders with no way home is hostile.
- Reads `useSettings()` directly, as `SettingsView` does; writes go straight to
  the setters and flow back down through `AudioContext`'s effect. The panel owns
  no DSP state of its own.
- Gain-reduction meters: one RAF loop guarded by `active`, polling
  `chain.reduction()` and writing a custom property onto two `<meter>` elements
  via refs — **not** React state. Same discipline as `FrequencyMatrix`: the mesh
  is written through refs so React renders once. Needs the usual
  `eslint-disable-next-line` naming the `requestAnimationFrame` loop, and must
  paint once synchronously on mount, because RAF is suspended while the window is
  hidden or occluded (the exact bug `FrequencyMatrix` documents).

### 7. `src/app/components/composite/Player.tsx`

- `PlayerMode` (149) → `'default' | 'lyrics' | 'visualizer' | 'dsp'`. Update the
  docblock above it: it currently explains why *two* panels are one mode.
- `PlayerPanel` (178-186) gains a `mode === 'dsp'` branch returning
  `<DspPanel chain={dspChain} active />`; add `dspChain` to `PlayerPanelProps`
  and thread it from `useAudio()` at 273 through the call site at 332, the way
  `analyzer` already is.
- `PlayerActions` (203-240) gains a third `<li>` before the close button, using
  the `dsp` icon that already exists (`Icon.tsx:12`, and `'dsp'` is already in
  the `IconName` union at `services/types.ts:25` — no icon work needed).
  Label pattern follows its neighbours:
  `showing('dsp') ? 'Show album art' : 'Show DSP processing'`.
- **Do not copy `disabled={!hasTrack}` from the other two buttons.** The
  spectrum and lyrics need a track to have anything to show; an EQ curve is
  editable in silence and there is no reason to lock it.

### 8. Styles

- **`layout.css`** — the `[data-mode]` block at 430-431. Fold `dsp` into the
  visualizer rule, since it wants the same space and keeps the transport for the
  same reason:
  `&:is([data-mode='visualizer'], [data-mode='dsp']) :is(.player-art, .progress-section) { display: none; }`
  Extend the comment above it. Remember `.player-view` **is** the
  `@container player / size` (`layout.css:414,423`), so nothing in a container query
  can style it — panel padding hangs off `[data-mode='dsp']` on the element
  itself.
- **`components.css`** — `.knob` and `.fader` blocks, after the `.slider` rule at
  104-126, native-nested with `&`-variants. Note `components.css:62` already
  excludes `[type='range']` from the generic bordered-input styling, so these
  start from a clean slate. The existing `.slider` has a `::-webkit-slider-thumb`
  rule and **no `::-moz-range-thumb`** — match that (Electron is Chromium-only),
  and say so in a comment so it reads as a decision rather than an omission.
  Vertical faders use `writing-mode: vertical-rl; direction: rtl` — the modern
  spelling, not the deprecated `appearance: slider-vertical`.
- **`layout.css`** — `.dsp-panel` layout (fieldset stack, the 16-column fader
  grid, meters). It goes here rather than `views.css` because it is part of the
  player's tier system, which lives in `layout.css` alongside `.player-art` and
  `.progress-section`. Give the panel `overflow-y: auto` — 16 faders plus 6 knobs
  will not fit the `snug` height tier.
- Every length, radius and colour from tokens: `--sp-*`, `--radius`,
  `--control-radius`, `--text-xs`/`--text-sm`, `--accent`, `--accent-muted`,
  `--accent-glow`, `--border`, `--bg-raised`, `--bg-input`, `--focus-ring`.
  There is **no `--surface`** token in this project. If a fader needs a new
  structural length, add a `--dsp-fader-h` token rather than a literal.

### 9. Un-disable the sidebar button

`LibrarySidebar.tsx:138-150` promises this feature. Leaving a greyed-out
"coming soon" next to the shipped thing is a bug, so:

- `UIContext`: add `playerMode: PlayerMode` + `setPlayerMode`, and move `mode`
  out of `Player`'s local `useState` (279) into it. `Player` keeps `toggleMode`'s
  return-to-artwork behaviour and keeps `activeMode = expanded ? mode : 'default'`
  unchanged — only where the value is *stored* moves. `PlayerMode` moves to
  `UIContext` beside `OverlayName` and `Player` imports it, since the context now
  owns it.
- The sidebar button drops `disabled` and the `Soon` badge and calls
  `setPlayerMode('dsp')` then `openOverlay('player')`.

This lift is where view state belongs in this codebase — the `UIContext` docblock
already frames itself as the owner of what's on screen. But it has a **known
test cost**: `tests/components/composite/Player.test.tsx:43-47` whole-module-mocks
`'../../../src/app/contexts'` with a hand-written factory (no `importOriginal`),
and `useUI()` is called unconditionally at `Player.tsx:271`. So the mock's
`useUI: () => ({ openOverlay, closeOverlay })` must gain `playerMode` and
`setPlayerMode` **or all ten tests in that file break at once**, with `mode`
arriving `undefined`. Two lines in the mock — but do them in the same commit.

If it fights harder than that, the fallback is to leave the sidebar button
disabled and ship the player-mode button alone; **say so rather than
half-doing it.**

### 10. Docs

- New `## DSP chain` section in `CLAUDE.md` — after "Now playing: what fills the
  middle", matching the register of the existing prose: the graph order and why
  the analyser sits after the chain, why bypass rewires instead of neutralising,
  why params go through `setTargetAtTime`, the dB/ms-in-UI vs seconds-at-the-node
  boundary, and the shallow-merge hazard `normalizeDsp` exists to close.
- Update the `## Player tiers` note that lists what each `data-mode` hides.
- The "Also see" list needs no change.

---

## Tests

| File | Covers |
|---|---|
| `tests/services/dspChain.test.ts` | Band count is 16, ascending, `lowshelf`/`peaking`/`highshelf` in the right slots, `BAND_Q` on every peaking band. `apply()` maps ms→s (attack 3 → 0.003, release 250 → 0.25) and dB straight through. Welded limiter constants. **`rewire()` connection order for all 8 on/off combinations**, including all-off (`input → output` directly) — this is the part most likely to be silently wrong. `normalizeDsp` pads a short `gains`, truncates a long one, clamps out-of-range numbers, and survives `undefined`/`null`/garbage. |
| `tests/components/atomic/Knob.test.tsx` | `getByRole('slider', { name: 'Threshold' })`, `toHaveValue`, `onChange` on `fireEvent.change`, `--knob-turn` reaches the DOM. Mirrors `WaveformProgress.test.tsx:6-28`. |
| `tests/components/atomic/Fader.test.tsx` | Same, vertical variant. |
| `tests/components/composite/DspPanel.test.tsx` | `getByRole('region', { name: 'DSP processing' })`; three `switch`-role checkboxes toggle the right settings; 16 sliders present; Flat resets every gain to 0. |
| `tests/components/composite/Player.test.tsx` | Extend the existing "only one panel at a time" test (135-146) to three modes; assert the DSP button is **not** disabled without a track. The `vi.mock` factory at 43-47 is hand-written and returns only `useUI`/`useAudio`/`useSettings`, so it needs `dsp: DEFAULT_DSP` + the new setters on `settings`, `dspChain: null` on `audio`, and (if step 9 lands) `playerMode`/`setPlayerMode` on `useUI`. |

`DspPanel.test.tsx` needs the same trick — mock `'../../../src/app/contexts'` with
a full `dsp` slice and spy setters, then assert the setter was called rather than
inspecting state. That's how `SegmentedControl.test.tsx` reads: behaviour at the
boundary, not internals.

`bun run test` — vitest, not `bun test`. Coverage thresholds are 35/30/35/35
(`config/vitest.config.ts`); a new pure module with real tests moves them up, not
down.

---

## Verification

1. `bun run typecheck` — clean.
2. `bun run lint` — **zero errors, zero warnings**, per CLAUDE.md. The two new
   effects (the `apply` push, the meter RAF loop) each need an
   `eslint-disable-next-line react-strict/prefer-no-use-effect` naming what they
   reach, or lint fails by design.
3. `bun run test` — full suite green. Watch specifically for pre-existing
   `AudioProvider` tests, which is what step 1 protects.
4. Runtime, in the real app (`bun run start`) — **this part needs you at the
   keyboard**; an Electron GUI does not come up under the agent sandbox:
   - Play a track, open Now Playing, click the DSP button. Panel appears, artwork
     and progress bar step aside, transport still works.
   - Enable the EQ, pull band 0 (20 Hz) to +12 → audible bass lift. Pull band 15
     (20 kHz) down → audible top loss.
   - Open the spectrum panel and toggle back to DSP a few times: because the
     analyser sits *after* the chain, a boosted band should visibly rise in the
     mesh. This is the single best end-to-end proof the chain is really in the
     signal path and not dangling.
   - Enable the compressor, threshold to −40, ratio 20 → obvious pumping, and the
     gain-reduction meter moves.
   - Enable the limiter, threshold to −20 → output audibly ceilings.
   - Toggle each module on/off during playback — audio must not drop out or click
     hard (this is what the 15 ms output ramp is for).
   - Reload the app: every setting comes back.
   - `localStorage.setItem('desktop-audio-settings', '{"dsp":{"eq":{"on":true,"gains":[3]}}}')`
     then reload → no crash, `gains` padded to 16, missing modules defaulted.
     That is `normalizeDsp` earning its place.
   - Shrink the window through the `snug` tier → the panel scrolls rather than
     clipping.
   - Light theme: every control has an explicit `color`. Per CLAUDE.md this is a
     repeat offender — dark theme hides a missing colour, light theme snaps it to
     #111.

---

## Three patterns this introduces for the first time

Nothing in `src` currently uses any of these, so each is a small precedent worth
setting deliberately rather than by accident:

- **`<input type='checkbox' role='switch'>`** for module bypass. The codebase's
  existing checkboxes (`SettingsView.tsx:365-370`, `TrackTable.tsx:283`) are plain
  `.checkbox-field` labels. A switch is the right semantic for on/off-now rather
  than agree-later, and `.checkbox-field` (`views.css:632-639`) is the layout to
  extend rather than replace.
- **`<meter>`** for gain reduction — the semantically correct element for a
  measurement within a known range, and exactly the "we have components for
  everything already" rule in `docs/DESIGN_GUIDE.md`. Do not build it from
  `<div>`s.
- **`writing-mode: vertical-rl`** on a range input, for the faders. The modern
  spelling; `appearance: slider-vertical` is the deprecated one. Safe here —
  Electron is pinned at **41.10.4** (Chromium ~140) and vertical range inputs via
  `writing-mode` landed in Chrome 119. Comment it, since it will look unfamiliar
  next to `.slider`.

## Risks

- **The existing AudioContext test mock is the top risk**, and step 1 exists
  solely to defuse it before anything else lands.
- `createMediaElementSource` can only be called once per element; the existing
  code already guards with `if (!sourceRef.current)`. Splicing the chain must not
  disturb that guard.
- 16 biquads + 2 compressors per playback session is negligible CPU, but they are
  built once in `setupAnalyzer()` and never rebuilt — do not create them in
  `loadTrack()`, which runs per track.
- A `<meter>` polled at 60 fps through refs is fine; a `<meter>` polled through
  `useState` would re-render the whole panel 60 times a second. The RAF loop must
  write to the DOM, not to state.
