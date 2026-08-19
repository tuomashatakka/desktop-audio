/**
 * The track's resolved harmony, read as type under its own title.
 *
 * The chords lead. Someone reading this is holding an instrument, so the lane
 * of what is sounding and what is next is the largest thing on the page, and
 * key, tempo and meter are a caption line under the album — three facts you
 * check once, not three rows of a table. The label gutter that used to line
 * `Chord`, `Key` and `Tempo` up went with them: a page with one graphic on it
 * does not need the graphic captioned.
 *
 * This used to live inside {@link FrequencyMatrix}, which made the track's
 * musical data a sub-detail of a spectrum widget. It is the other way round:
 * the mesh is the backdrop, and this is what the analysis view is *for*. So it
 * is its own block in the type column, rising into the space the artwork
 * vacates.
 *
 * Always mounted, shown by `data-open` — `display` is what animates it in and
 * out (`allow-discrete` + `@starting-style`, as everywhere else here), and an
 * unmounted element has nothing to animate.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { TrackAnalysis, ChordSegment, BeatMarker } from '../../services/types'
import type { AnalysisStatus } from '../../hooks/useTrackAnalysis'


/**
 * How many chords past the current one the queue holds.
 *
 * The queue is clipped by its own box, so this is a ceiling on DOM nodes rather
 * than on what is visible: how far ahead you can *see* is `--chord-pps` against
 * the queue's width, and that belongs in CSS with the rest of the geometry.
 */
const QUEUE_LENGTH = 16

/** The index of the chord sounding at `time`, or `-1` between or before them. */
export function chordAt (chords: readonly ChordSegment[], time: number): number {
  return chords.findIndex(chord =>
    time >= chord.start && time < chord.end)
}

/**
 * The index of the first chord that has not started yet, or `-1`.
 *
 * Only used before the first chord and in the gaps between segments — once one
 * is sounding, the queue simply starts after it.
 */
export function firstAfter (chords: readonly ChordSegment[], time: number): number {
  return chords.findIndex(chord =>
    chord.start > time)
}

/**
 * The chords the queue should hold, given the sounding one.
 *
 * Keyed off an *index* rather than off `time` so the array only changes when
 * the chord does. `currentTime` arrives from a `timeupdate` listener four times
 * a second; rebuilding this list at that rate would re-key ten elements and
 * restart their animations three times per chord.
 */
export function queuedChords (
  chords: readonly ChordSegment[],
  from: number
): readonly ChordSegment[] {
  return from < 0 ? [] : chords.slice(from, from + QUEUE_LENGTH)
}

/**
 * Beats per bar, from the highest beat index the analyser reported.
 *
 * The resolver already numbers every beat within its bar (`BeatMarker.beat`),
 * so the meter is the maximum of that plus one — no second pass over the audio
 * and no guess. `null` when there is not enough to be sure: a handful of beats
 * is a failed detection rather than a short song, and a meter outside 2–12 is
 * the resolver having lost the downbeat. The caption simply drops the pair.
 */
export function meterOf (beats: readonly BeatMarker[]): number | null {
  if (beats.length < 8)
    return null

  const meter = beats.reduce((highest, marker) =>
    Math.max(highest, marker.beat), 0) + 1

  return meter >= 2 && meter <= 12 ? meter : null
}

interface ChordRibbonProps {
  readonly chords:      readonly ChordSegment[]
  readonly currentTime: number
  readonly isPlaying:   boolean
}

/**
 * The chord timeline: what is sounding, pinned, and what is coming, sliding in.
 *
 * ```
 * ┌─ .chord-now ──┬─ .chord-queue (clipped) ─────────────────┐
 * │  Am           │    F        C            G               │
 * │  ↑ pinned     │  ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←        │
 * └───────────────┴──────────────────────────────────────────┘
 * ```
 *
 * Distance from the anchor *is* the time until a chord plays: every queued
 * chord sits at `--at` (its own start, in seconds) and the whole lane is
 * translated by `-now`, so its offset resolves to `(start − now) × --chord-pps`.
 * That makes a frame one property write on one element, whatever the chord
 * count — and it puts the pixels-per-second in CSS, next to the width that
 * decides how far ahead you can see.
 *
 * The two elements in `.chord-now` are **keyed by `chord.start`**, so a chord
 * change *mounts* them. That is the whole mechanism behind both animations: the
 * arriving chord flashes because it is new, and the departing one drifts off to
 * the left because it is new too, in a slot that animates that way. Neither
 * needs a timer to clean up after it.
 */
function ChordRibbon ({ chords, currentTime, isPlaying }: ChordRibbonProps) {
  const laneRef = useRef<HTMLOListElement>(null)

  const index    = chordAt(chords, currentTime)
  const current  = index >= 0 ? chords[index] : undefined
  const previous = index > 0 ? chords[index - 1] : undefined
  const from     = index >= 0 ? index + 1 : firstAfter(chords, currentTime)

  const queue = useMemo(() =>
    queuedChords(chords, from), [ chords, from ])

  // `currentTime` updates four times a second — nowhere near enough to move a
  // ribbon — so the lane interpolates between those ticks against the wall
  // clock. Re-running on every `currentTime` change is deliberate: each tick
  // re-anchors the interpolation to the real playback position, so the lane
  // cannot drift away from the audio.
  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Owns a `requestAnimationFrame` loop; the lane is written through a ref precisely so React does not re-render sixty times a second.
  useEffect(() => {
    const lane = laneRef.current
    if (!lane)
      return

    const write = (seconds: number) =>
      lane.style.setProperty('--now', seconds.toFixed(3))

    // Paint once synchronously: `requestAnimationFrame` is suspended while the
    // window is hidden or occluded, and a paused ribbon still has to be in the
    // right place.
    write(currentTime)

    const reduced = typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!isPlaying || reduced)
      return

    const stamp = performance.now()

    let frame = requestAnimationFrame(function loop (now) {
      write(currentTime + (now - stamp) / 1000)
      frame = requestAnimationFrame(loop)
    })

    return () =>
      cancelAnimationFrame(frame)
  }, [ currentTime, isPlaying ])

  // A figure, not a labelled div: the ribbon is one graphic about the track.
  // It carries an `aria-label` rather than a `figcaption` — the caption was
  // visible type in a gutter that no longer exists, and the lane is now the
  // largest thing on the page, which captions it well enough. The queue is a
  // real `<ol>`
  // because it is one — the chords in the order they will play — even though
  // only sighted readers ever see it move; the pinned pair beside it is what
  // announces, so the queue stays out of the accessibility tree rather than
  // reading a list of futures over the top of it.
  return <figure className='chord-ribbon' aria-label='Chords'>
    <p className='chord-now' aria-live='polite' aria-atomic='true'>
      {previous &&
        <span key={ previous.start } className='chord' data-state='past'>{previous.label}</span>}

      <span key={ current?.start ?? 'none' } className='chord' data-state='current'>
        {current?.label ?? '—'}
      </span>
    </p>

    <ol ref={ laneRef } className='chord-queue' aria-hidden='true'>
      {queue.map(chord =>
        <li
          key={ chord.start }
          className='chord'
          /* eslint-disable-next-line react-strict/no-style-prop -- Position is measured data — the chord's own start time — not a stylesheet's decision. */
          style={{ '--at': chord.start.toFixed(3) } as CSSProperties}
          data-state='next'>
          {chord.label}
        </li>
      )}
    </ol>
  </figure>
}

interface KeyTempoProps {
  readonly analysis: TrackAnalysis
}

/**
 * `B minor · 87.5 bpm · 4/4` — one line, read once.
 *
 * A description list still, because that is what it is, but the terms are for
 * screen readers only: `Key` beside `B minor` is a caption on a caption, and
 * the three used to occupy three rows and a four-em label gutter for it. The
 * separators are generated, so the line has no punctuation to strip when a
 * pair is missing.
 */
function KeyTempo ({ analysis }: KeyTempoProps) {
  const meter = meterOf(analysis.beats)

  return <dl className='track-meta'>
    <div>
      <dt className='sr-only'>Key</dt>
      <dd>{analysis.key.label}</dd>
    </div>

    <div>
      <dt className='sr-only'>Tempo</dt>

      <dd>
        {analysis.tempo.bpm.toFixed(1)}
        {' '}
        <abbr title='beats per minute'>bpm</abbr>
      </dd>
    </div>

    {meter !== null &&
      <div>
        <dt className='sr-only'>Meter</dt>
        <dd>{meter}/4</dd>
      </div>
    }
  </dl>
}

/** How often the elapsed readout refreshes. A readout, not an animation. */
const PROGRESS_TICK_MS = 500

/** The bar never claims to be done before the result is actually in. */
const PROGRESS_CEILING = 0.95

/** Seconds left, phrased for someone waiting rather than for a log. */
function remainingLabel (remainingMs: number | null): string {
  if (remainingMs === null)
    return 'Resolving chords, key and tempo…'

  return remainingMs > 0
    ? `Resolving chords, key and tempo — about ${Math.ceil(remainingMs / 1000)}s left`
    : 'Resolving chords, key and tempo — almost there'
}

interface AnalysisProgressProps {
  readonly startedAt:  number | null
  readonly estimateMs: number | null
}

/**
 * What the analyzer is doing, and roughly how much longer.
 *
 * A native `<progress>`, which gives both states for free: with a `value` it is
 * a bar, and without one it is the platform's own indeterminate spinner. That
 * is exactly the distinction here — the estimate is a learned rate against the
 * track's duration (see `useTrackAnalysis`), and the very first analysis of a
 * session has nothing to learn from yet.
 *
 * It is deliberately not a live region. The bar reports itself to assistive
 * technology already, and a countdown that announced twice a second would be
 * unusable; the error and unavailable states below are the ones worth speaking.
 */
function AnalysisProgress ({ startedAt, estimateMs }: AnalysisProgressProps) {
  const [ elapsed, setElapsed ] = useState(0)

  // eslint-disable-next-line react-strict/prefer-no-use-effect -- Owns an interval for as long as an analysis is running. Elapsed time is not derivable from a render.
  useEffect(() => {
    if (startedAt === null)
      return

    const read = () =>
      setElapsed(Date.now() - startedAt)

    read()

    const tick = setInterval(read, PROGRESS_TICK_MS)

    return () =>
      clearInterval(tick)
  }, [ startedAt ])

  const ratio     = estimateMs ? Math.min(PROGRESS_CEILING, elapsed / estimateMs) : null
  const remaining = estimateMs ? Math.max(0, estimateMs - elapsed) : null

  return <p className='analysis-status'>
    <progress
      className='analysis-progress'
      aria-label='Analysing audio'
      value={ ratio ?? undefined }
      max={ 1 } />

    <span>{remainingLabel(remaining)}</span>
  </p>
}

interface AnalysisBodyProps {
  readonly analysis:    TrackAnalysis | null
  readonly status:      AnalysisStatus
  readonly error:       string | null
  readonly currentTime: number
  readonly isPlaying:   boolean
  readonly showChord:   boolean
  readonly showKey:     boolean
  readonly startedAt?:  number | null
  readonly estimateMs?: number | null
}

function AnalysisBody ({
  analysis, status, error, currentTime, isPlaying, showChord, showKey,
  startedAt = null, estimateMs = null,
}: AnalysisBodyProps) {
  if (status === 'loading')
    return <AnalysisProgress startedAt={ startedAt } estimateMs={ estimateMs } />

  // The failure is shown, never swallowed. It arrives already phrased for a
  // reader — the worker turns the resolver's own refusal into a sentence, and
  // a decode refusal on an Ableton `.aif` is a fact about the file rather than
  // something that went wrong here, so it is stated plainly and not apologised
  // for.
  if (status === 'error')
    return <p className='analysis-status' role='status'>
      No analysis: {error}
    </p>

  if (!analysis)
    return <p className='analysis-status' role='status'>
      Harmony analysis is unavailable
    </p>

  return <>
    {showKey && <KeyTempo analysis={ analysis } />}

    {showChord && analysis.chords.length > 0 &&
      <ChordRibbon chords={ analysis.chords } currentTime={ currentTime } isPlaying={ isPlaying } />}
  </>
}

interface AnalysisReadoutProps extends AnalysisBodyProps {

  /** True in the analysis view; the block is mounted either way. */
  readonly open: boolean
}

export function AnalysisReadout ({ open, ...body }: AnalysisReadoutProps) {
  return <section
    className='analysis-readout'
    data-open={ open || undefined }
    aria-label='Audio analysis'
    aria-hidden={ open ? undefined : true }>
    <AnalysisBody { ...body } />
  </section>
}
