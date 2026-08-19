import { useUI, useAudio, useSettings } from '../../contexts'
import { FrequencyMatrix } from './FrequencyMatrix'
import { AnalysisReadout } from './AnalysisReadout'
import type { Track, RepeatMode, PlayerMode } from '../../contexts'
import { Icon, IconButton, Button } from '../atomic'
import { WaveformProgress } from '../atomic/WaveformProgress'
import { useTrackAnalysis, useWindowScale, useLyricsScroll, useHeightTier } from '../../hooks'
import type { TrackAnalysisState } from '../../hooks'
import { useArtwork } from '../../hooks/useArtwork'
import { formatTime, isoDuration } from '../../utils/time'
import type { BeatMarker } from '../../services/types'


/** Cycle order for the repeat button: off → whole queue → single track. */
const REPEAT_CYCLE: Record<RepeatMode, RepeatMode> = {
  none: 'all',
  all:  'one',
  one:  'none',
}

const REPEAT_LABEL: Record<RepeatMode, string> = {
  none: 'Repeat off',
  all:  'Repeat queue',
  one:  'Repeat track',
}


type PlayerArtworkProps = { readonly track: Track | null }

/**
 * The cover. A picture, and only a picture.
 *
 * It used to be a `<button>` that resized the window, which meant the
 * now-playing view rearranged itself when you clicked the artwork — the same
 * gesture doing two unrelated things depending on how big the window already
 * was. The window-size toggle is its own labelled control in `.player-actions`
 * now, and this is a `<figure>` with an `<img>` in it, which is what it always
 * was.
 */
function PlayerArtwork ({ track }: PlayerArtworkProps) {
  // Full resolution, not the list thumbnail — this is the largest the artwork
  // is ever shown, and there is only ever one current track to pay for it.
  const art = useArtwork(track?.id, 'full')

  return <figure className='player-art'>
    <span className='album-art-card'>
      {art
        ? <img src={ art } alt='' />
        : <Icon className='art-fallback' name='music' />
      }
    </span>
  </figure>
}

type PlayerTransportProps = {
  readonly hasTrack:   boolean
  readonly isPlaying:  boolean
  readonly onPrevious: () => void
  readonly onToggle:   () => void
  readonly onNext:     () => void

  readonly shuffle:    boolean
  readonly onShuffle:  () => void
  readonly repeatMode: RepeatMode
  readonly onRepeat:   () => void
}

function PlayerTransport ({
  hasTrack, isPlaying, onPrevious, onToggle, onNext,
  shuffle, onShuffle, repeatMode, onRepeat,
}: PlayerTransportProps) {
  return <menu className='playback-controls' aria-label='Playback'>
    {/* Shuffle and repeat sit inside the transport rather than beside it:
          they're modes of the same control group, and the tier rules only
          have to shed one element to drop both. */}
    <li className='mode shuffle'>
      <IconButton
        aria-pressed={ shuffle }
        data-active={ shuffle || undefined }
        label={ shuffle ? 'Shuffle on' : 'Shuffle off' }
        type='button'
        onClick={ onShuffle }>
        <Icon name='shuffle' />
      </IconButton>
    </li>

    <li className='prev'>
      <IconButton label='Previous' type='button' disabled={ !hasTrack } onClick={ onPrevious }>
        <Icon name='previous' />
      </IconButton>
    </li>

    <li className='play'>
      <Button
        className='play-pause-btn'
        aria-label={ isPlaying ? 'Pause' : 'Play' }
        aria-pressed={ isPlaying }
        variant='primary'
        icon
        type='button'
        disabled={ !hasTrack }
        onClick={ onToggle }>
        <Icon name={ isPlaying ? 'pause' : 'play' } />
      </Button>
    </li>

    <li className='next'>
      <IconButton label='Next' type='button' disabled={ !hasTrack } onClick={ onNext }>
        <Icon name='next' />
      </IconButton>
    </li>

    <li className='mode repeat'>
      <IconButton
        data-repeat={ repeatMode }
        data-active={ repeatMode === 'none' ? undefined : true }
        label={ REPEAT_LABEL[repeatMode] }
        type='button'
        onClick={ onRepeat }>
        <Icon name='repeat' />
        {repeatMode === 'one' && <span className='mode-badge' aria-hidden='true'>1</span>}
      </IconButton>
    </li>
  </menu>
}

/**
 * The lyrics layer of the full-window player.
 *
 * It is a *layer*, not a mode: it sits down the trailing edge of whatever the
 * mode put in the middle and nudges that content aside, rather than replacing
 * it. Reading along used to cost you the spectrum, the EQ and the transport,
 * all at once, because it was the panel that took their place.
 *
 * Always mounted once the overlay is open, and shown by `data-open`, because
 * the enter and exit transitions are CSS (`allow-discrete` + `@starting-style`,
 * as everywhere else in this app). Unmounting on close would animate one
 * direction only.
 */
type PlayerLyricsProps = {
  readonly track:       Track | null
  readonly open:        boolean
  readonly currentTime: number
  readonly duration:    number
}

function PlayerLyrics ({ track, open, currentTime, duration }: PlayerLyricsProps) {
  // Reopening restarts the follow, so taking the panel over is never sticky
  // beyond the reading it was meant for.
  const ref = useLyricsScroll<HTMLElement>(
    duration > 0 ? currentTime / duration : 0,
    `${track?.id ?? ''}:${open}`
  )

  return <section
    ref={ ref }
    className='player-lyrics'
    data-open={ open || undefined }
    aria-label='Lyrics'
    aria-hidden={ open ? undefined : true }>
    {track?.lyrics
      ? <pre>{track.lyrics}</pre>
      : <p className='status-message'>No lyrics in this file&apos;s tags</p>
    }
  </section>
}

type PlayerInfoProps = { readonly track: Track | null }

/**
 * Title, artist, album.
 *
 * The inner span on the title is the marquee track: it sizes to the text so
 * CSS can compare it against the title box and scroll only the overflow. See
 * `.track-title` in layout.css.
 */
function PlayerInfo ({ track }: PlayerInfoProps) {
  return <hgroup className='player-info'>
    <h2 className='track-title'>
      <span>{track?.title ?? 'Nothing playing'}</span>
    </h2>

    <p className='track-artist'>{track?.artist}</p>
    <p className='track-album'>{track?.album}</p>
  </hgroup>
}

type PlayerActionsProps = {
  readonly mode:       PlayerMode
  readonly lyricsOpen: boolean
  readonly hasTrack:   boolean
  readonly compact:    boolean
  readonly onMode:     () => void
  readonly onLyrics:   () => void
  readonly onResize:   () => void
  readonly onClose:    () => void
}

/**
 * Switch the view, add the lyrics layer to it, resize the window, or leave.
 *
 * A menu of controls, like `.playback-controls` — same shape, so the two read
 * alike and neither is a bare `<div>`. The first two are `aria-pressed`
 * toggles because each has an on state you can see; the last two act once and
 * are plain buttons.
 *
 * **Every item carries a class**, the way `PlayerTransport`'s do, because the
 * footer bar and the mini window show *one* of them — the window-size toggle —
 * and hide the rest. That is not cosmetic: `useWindowScale` is the only thing
 * that can resize the window, and below the `normal` height tier there is no
 * other control on screen at all (`.player-promote` is `normal`-only), so
 * without this button in the bar the small player is a room with no door.
 *
 * Audio processing is no longer here. It is its own overlay, reached from the
 * sidebar, because it never fitted above a transport that also had to stay on
 * screen.
 */
function PlayerActions ({
  mode, lyricsOpen, hasTrack, compact, onMode, onLyrics, onResize, onClose,
}: PlayerActionsProps) {
  const analysing = mode === 'analysis'

  return <menu className='player-actions' aria-label='Player'>
    <li className='view'>
      <IconButton
        className='analysis-toggle'
        aria-pressed={ analysing }
        label={ analysing ? 'Show album art' : 'Show audio analysis' }
        type='button'
        disabled={ !hasTrack }
        onClick={ onMode }>
        <Icon name='spectrum' />
      </IconButton>
    </li>

    <li className='lyrics'>
      <IconButton
        className='lyrics-toggle'
        aria-pressed={ lyricsOpen }
        label={ lyricsOpen ? 'Hide lyrics' : 'Show lyrics' }
        type='button'
        disabled={ !hasTrack }
        onClick={ onLyrics }>
        <Icon name='lyrics' />
      </IconButton>
    </li>

    {/* No `disabled`, unlike the two above: the analysis and the lyrics need a
        track to have anything to show, and a window is resizable regardless —
        which is exactly why this is the one that survives into the bar. */}
    <li className='size'>
      <IconButton
        className='window-size-toggle'
        label={ compact ? 'Restore window size' : 'Shrink to compact player' }
        type='button'
        onClick={ onResize }>
        <Icon name={ compact ? 'maximize' : 'minimize' } />
      </IconButton>
    </li>

    <li className='close'>
      <IconButton className='player-close' label='Close player' type='button' onClick={ onClose }>
        <Icon name='close' />
      </IconButton>
    </li>
  </menu>
}

function playerAriaLabel (track: Track | null): string {
  return track ? `Now playing: ${track.title}` : 'Player'
}

/**
 * `''` when there is nothing playing, `undefined` when there is — the same
 * present-or-absent shape `data-empty` wants. It is what retracts the footer
 * bar to zero height (`--player-h`), so it has to be an attribute rather than a
 * class.
 */
function emptyFlag (track: Track | null): '' | undefined {
  return track ? undefined : ''
}

type PlayerProps = {

  /**
   * True for the now-playing overlay's copy; false for the footer bar's.
   *
   * It selects *values*, never markup — see the component docstring. The two
   * copies render byte-identical DOM.
   */
  readonly expanded?: boolean
}

function visibleBeatMarkers (
  analysis: TrackAnalysisState,
  showBeatMarkers: boolean
): readonly BeatMarker[] | undefined {
  return showBeatMarkers ? analysis.analysis?.beats : undefined
}

/**
 * The one and only player — one component, one DOM, rendered twice.
 *
 * **Nothing here is conditionally rendered.** Every element is always in the
 * tree, in both copies, and every state change is a `data-*` attribute that CSS
 * animates: `data-mode`, `data-lyrics`, `data-empty`. That is not a style
 * preference — it is the only way the enter *and* the exit of a panel can both
 * be animated, because an element that unmounts has nothing left to animate
 * with, and it is what stops the two copies from drifting into two different
 * components with one name.
 *
 * The two copies differ only in where they sit. The footer bar's is inside
 * `.app-shell`, so the height-tier and footer-bar rules in `layout.css` reach
 * it. The overlay's is portaled to `document.body` by {@link Overlay},
 * *outside* the shell, so none of those descendant selectors match and it falls
 * through to the full-window layout by default. There is no bar/full switch in
 * CSS beyond where the element happens to be.
 *
 * `expanded` therefore never branches the markup. It feeds *values* — which
 * copy owns the analyser's animation frame, and whether the lyrics layer is
 * open — so that two mounted copies do not both run a `requestAnimationFrame`
 * loop over the same `AnalyserNode`.
 *
 * The class hooks here (`.player-view`, `.player-content`, `.album-art-card`,
 * `.player-info`, `.progress-section`, `.playback-controls`) are a deliberate
 * contract with the tier/container-query system; renaming them means rewriting
 * that system.
 */
export function Player ({ expanded = false }: PlayerProps) {
  const {
    openOverlay, closeOverlay, playerMode, setPlayerMode,
    lyricsOpen, toggleLyrics,
  } = useUI()
  const {
    currentTrack, isPlaying, currentTime, duration, waveformBars, analyzer,
    pause, resume, seek, playNext, playPrevious,
  }                                                        = useAudio()
  const {
    shuffle, setShuffle, repeatMode, setRepeatMode,
    showBeatMarkers, showChordAnalysis, showKeyAnalysis, showSpectrumNotes,
  }                       = useSettings()
  const analysis          = useTrackAnalysis(currentTrack)
  const toggleWindowScale = useWindowScale()

  // Which way the size button points. The tier is already measured for the
  // shell's `data-height-tier`, so this reuses that rather than re-reading
  // `window.innerHeight` for the same answer.
  const compactWindow = useHeightTier() !== 'normal'

  /**
   * One button, two views. The value lives in `UIContext` so the sidebar can
   * open the overlay straight onto one.
   */
  const toggleMode = () =>
    setPlayerMode(playerMode === 'analysis' ? 'default' : 'analysis')

  // Only the overlay's copy runs the analysis view. Both are mounted and both
  // render the mesh and the readout, but two rAF loops reading one
  // `AnalyserNode` is twice the work for one picture, and the bar has nowhere
  // to put either of them. `data-mode` still reports the honest mode on both —
  // the CSS that rearranges the page for it is scoped to `.player-overlay`.
  const analysing  = playerMode === 'analysis'
  const animating  = expanded && analysing
  const showLyrics = expanded && lyricsOpen ? true : undefined

  // Shares the cache entry `PlayerArtwork` above already warmed for this track.
  const currentArt = useArtwork(currentTrack?.id, 'full')

  return <article
    className='player-view'
    data-empty={ emptyFlag(currentTrack) }
    data-mode={ analysing ? 'analysis' : 'default' }
    data-lyrics={ showLyrics }
    aria-label={ playerAriaLabel(currentTrack) }>
    {/* Keyed by track so the fade-in keyframe re-runs on a change. `src` is
        empty rather than the element being absent when there is no cover — a
        missing `<img>` cannot fade out. */}
    <div key={ currentTrack?.id } className='album-art-bg' aria-hidden='true'>
      {currentArt && <img src={ currentArt } alt='' />}
    </div>

    {/* The bar's whole surface is the "open now playing" affordance. The
        overlay hides it in CSS rather than dropping it from the tree — this is
        the same DOM in both copies. */}
    <button
      className='player-promote'
      aria-label='Open now playing'
      type='button'
      disabled={ !currentTrack }
      onClick={ () =>
        openOverlay('player') } />

    <div className='player-content'>
      <PlayerArtwork track={ currentTrack } />
      <PlayerInfo track={ currentTrack } />
      {/* The mesh is the page's backdrop rather than a block in this column,
          but it is absolutely positioned against `.player-content`, so it has
          to live inside it. `active` is what drives its rAF loop — the loop
          stops the moment the view changes, while the element stays behind for
          its fade-out. */}
      <FrequencyMatrix analyzer={ analyzer } active={ animating } showNotes={ showSpectrumNotes } />

      <AnalysisReadout
        open={ animating }
        analysis={ analysis.analysis }
        status={ analysis.status }
        error={ analysis.error }
        currentTime={ currentTime }
        isPlaying={ isPlaying }
        showChord={ showChordAnalysis }
        showKey={ showKeyAnalysis }
        startedAt={ analysis.startedAt }
        estimateMs={ analysis.estimateMs } />

      {/* A menu of controls, like `.playback-controls` below — same shape so
          the two read alike and neither is a bare <div>. */}
      <PlayerActions
        mode={ playerMode }
        lyricsOpen={ lyricsOpen }
        hasTrack={ Boolean(currentTrack) }
        compact={ compactWindow }
        onMode={ toggleMode }
        onLyrics={ toggleLyrics }
        onResize={ toggleWindowScale }
        onClose={ closeOverlay } />

      <section className='progress-section' aria-label='Playback position'>
        <WaveformProgress
          currentTime={ currentTime }
          duration={ duration }
          bars={ waveformBars }
          markers={ visibleBeatMarkers(analysis, showBeatMarkers) }
          onSeek={ seek } />

        <div className='time-row'>
          <time className='time-label' dateTime={ isoDuration(currentTime) }>
            {formatTime(currentTime)}
          </time>

          <time className='time-label' dateTime={ isoDuration(duration) }>
            {formatTime(duration)}
          </time>
        </div>
      </section>

      <PlayerTransport
        hasTrack={ Boolean(currentTrack) }
        isPlaying={ isPlaying }
        shuffle={ shuffle }
        repeatMode={ repeatMode }
        onPrevious={ playPrevious }
        onToggle={ isPlaying ? pause : resume }
        onNext={ playNext }
        onShuffle={ () =>
          setShuffle(!shuffle) }
        onRepeat={ () =>
          setRepeatMode(REPEAT_CYCLE[repeatMode]) } />
    </div>

    {/* Outside `.player-content`, because it is a layer over the whole view
        rather than another block in its column — and because the nudge that
        makes room for it is applied to `.player-content` itself. */}
    <PlayerLyrics
      track={ currentTrack }
      open={ Boolean(showLyrics) }
      currentTime={ currentTime }
      duration={ duration } />
  </article>
}
