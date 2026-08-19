import { useUI, useAudio, useSettings } from '../../contexts'
import { FrequencyMatrix } from './FrequencyMatrix'
import { AnalysisReadout } from './AnalysisReadout'
import { DspPanel } from './DspPanel'
import type { Track, RepeatMode, PlayerMode } from '../../contexts'
import { Icon, IconButton, Button } from '../atomic'
import { WaveformProgress } from '../atomic/WaveformProgress'
import { useTrackAnalysis, useWindowScale, useLyricsScroll } from '../../hooks'
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


type PlayerArtworkProps = {
  readonly track:    Track | null
  readonly onToggle: () => void
}

function PlayerArtwork ({ track, onToggle }: PlayerArtworkProps) {
  // Full resolution, not the list thumbnail — this is the largest the artwork
  // is ever shown, and there is only ever one current track to pay for it.
  const art = useArtwork(track?.id, 'full')

  return <figure className='player-art'>
    {/* Album art doubles as the compact/expanded window toggle, so the
          figure contains a real button rather than becoming clickable. */}
    <button
      className='album-art-card'
      aria-label='Toggle compact player size'
      type='button'
      disabled={ !track }
      onClick={ onToggle }>
      {art
        ? <img src={ art } alt='' />
        : <Icon className='art-fallback' name='music' />
      }
    </button>
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
  readonly dspOpen:    boolean
  readonly hasTrack:   boolean
  readonly onMode:     () => void
  readonly onLyrics:   () => void
  readonly onDsp:      () => void
  readonly onClose:    () => void
}

/**
 * The overlay's top-right controls: switch the view, add a layer to it, or
 * leave.
 *
 * A menu of controls, like `.playback-controls` — same shape, so the two read
 * alike and neither is a bare `<div>`. Only the first button changes the
 * *view*; lyrics and audio processing are layers that arrive beside whichever
 * view is showing, which is why all three are `aria-pressed` toggles and none
 * of them is a radio in a group.
 */
function PlayerActions ({
  mode, lyricsOpen, dspOpen, hasTrack, onMode, onLyrics, onDsp, onClose,
}: PlayerActionsProps) {
  const analysing = mode === 'analysis'

  return <menu className='player-actions' aria-label='Player'>
    <li>
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

    <li>
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

    {/* No `disabled` here, unlike the two above: the analysis and the lyrics
        need a track to have anything to show, but an EQ curve is editable in
        silence — which is exactly when you might want to set one up. */}
    <li>
      <IconButton
        className='dsp-toggle'
        aria-pressed={ dspOpen }
        label={ dspOpen ? 'Hide audio processing' : 'Show audio processing' }
        type='button'
        onClick={ onDsp }>
        <Icon name='dsp' />
      </IconButton>
    </li>

    <li>
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
 * `true` when the lyrics layer is showing, `undefined` when it is not — the
 * shape `data-lyrics` wants, since a `data-*` attribute is present or absent
 * rather than true or false.
 *
 * Only the overlay has room for it, so `expanded` gates it here rather than at
 * the call site: the layer is always mounted (its exit animation needs it to
 * be), and this is the one place that decides whether it is open.
 */
function lyricsShowing (expanded: boolean, lyricsOpen: boolean): true | undefined {
  return expanded && lyricsOpen ? true : undefined
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

  /** True for the now-playing overlay's copy; false for the footer bar's. */
  readonly expanded?: boolean
}

function visibleBeatMarkers (
  expanded: boolean,
  analysis: TrackAnalysisState,
  showBeatMarkers: boolean
): readonly BeatMarker[] | undefined {
  return expanded && showBeatMarkers ? analysis.analysis?.beats : undefined
}

/**
 * The one and only player — rendered twice, from one component.
 *
 * The footer bar's copy lives inside `.app-shell`, so the height-tier and
 * footer-bar rules in `layout.css` reach it. The now-playing overlay's copy is
 * portaled to `document.body` by {@link Overlay}, *outside* the shell, so none
 * of those descendant selectors match and it falls through to the full-window
 * layout by default. That is the whole mechanism — there is no bar/full switch
 * in CSS beyond where the element happens to sit.
 *
 * `expanded` therefore only drives the things CSS cannot decide: which chrome
 * is in the DOM at all.
 *
 * The class hooks here (`.player-view`, `.player-content`, `.album-art-card`,
 * `.player-info`, `.progress-section`, `.playback-controls`) are a deliberate
 * contract with the tier/container-query system; renaming them means rewriting
 * that system.
 */
export function Player ({ expanded = false }: PlayerProps) {
  const {
    openOverlay, closeOverlay, playerMode, setPlayerMode,
    lyricsOpen, toggleLyrics, dspOpen, toggleDsp,
  } = useUI()
  const {
    currentTrack, isPlaying, currentTime, duration, waveformBars, analyzer,
    pause, resume, seek, playNext, playPrevious,
  }                                                        = useAudio()
  const { shuffle, setShuffle, repeatMode, setRepeatMode,
    showBeatMarkers, showChordAnalysis, showKeyAnalysis,
    showSpectrumNotes }                                   = useSettings()
  const analysis                                          = useTrackAnalysis(currentTrack)
  const toggleWindowScale                                 = useWindowScale()

  /**
   * One button, two views. The value lives in `UIContext` so the sidebar can
   * open the overlay straight onto one.
   */
  const toggleMode = () =>
    setPlayerMode(playerMode === 'analysis' ? 'default' : 'analysis')

  // These layers only make sense in the full-window player; the footer bar and
  // the mini tiers have nowhere to put them, so they aren't in their DOM at
  // all rather than being hidden after the fact.
  const activeMode = expanded ? playerMode : 'default'
  const showLyrics = lyricsShowing(expanded, lyricsOpen)
  const analysing  = activeMode === 'analysis'
  const showDsp    = expanded && dspOpen ? true : undefined

  // Shares the cache entry `PlayerArt` above already warmed for this track.
  const currentArt = useArtwork(currentTrack?.id, 'full')

  return <article
    className='player-view'
    data-empty={ emptyFlag(currentTrack) }
    data-mode={ analysing ? activeMode : undefined }
    data-lyrics={ showLyrics }
    data-dsp={ showDsp }
    aria-label={ playerAriaLabel(currentTrack) }>
    {currentArt &&
        <div key={ currentTrack?.id } className='album-art-bg' aria-hidden='true'>
          <img src={ currentArt } alt='' />
        </div>
    }

    {/* The bar's whole surface is the "open now playing" affordance; the
          overlay it opens obviously doesn't need one. */}
    {!expanded &&
      <button
        className='player-promote'
        aria-label='Open now playing'
        type='button'
        disabled={ !currentTrack }
        onClick={ () =>
          openOverlay('player') } />
    }

    <div className='player-content'>
      <PlayerArtwork track={ currentTrack } onToggle={ toggleWindowScale } />
      <PlayerInfo track={ currentTrack } />

      {/* Everything the overlay adds, in one branch: the footer bar and the
          mini tiers have nowhere to put any of it, so none of it is in their
          DOM rather than being hidden after the fact.

          The mesh is the page's backdrop rather than a block in this column,
          but it is absolutely positioned against `.player-content`, so it has
          to live inside it. `active` is what drives its rAF loop — the loop
          stops the moment the view changes, while the element stays behind for
          its fade-out. The readout and the DSP layer are mounted for the same
          reason: their arrival and departure are `display` transitions, and an
          unmounted element has nothing to animate. */}
      {expanded && <>
        <FrequencyMatrix analyzer={ analyzer } active={ analysing } showNotes={ showSpectrumNotes } />

        <AnalysisReadout
          open={ analysing }
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
          mode={ activeMode }
          lyricsOpen={ lyricsOpen }
          dspOpen={ dspOpen }
          hasTrack={ Boolean(currentTrack) }
          onMode={ toggleMode }
          onLyrics={ toggleLyrics }
          onDsp={ toggleDsp }
          onClose={ closeOverlay } />

        {/* The wrapper is what animates: `grid-template-rows` interpolates
            between `0fr` and `1fr` where `height: auto` cannot, so the blocks
            above ride up and the transport rides down rather than jumping. */}
        <div className='dsp-layer' data-open={ showDsp } aria-hidden={ showDsp ? undefined : true }>
          <DspPanel />
        </div>
      </>}

      <section className='progress-section' aria-label='Playback position'>
        <WaveformProgress
          currentTime={ currentTime }
          duration={ duration }
          bars={ waveformBars }
          markers={ visibleBeatMarkers(expanded, analysis, showBeatMarkers) }
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
        makes room for it is applied to `.player-content` itself.

        Always mounted, unlike `PlayerActions`: `display` is what animates it
        in and out, and an unmounted element has nothing to animate. The bar's
        copy never shows it, since `data-open` can only be set when expanded. */}
    <PlayerLyrics
      track={ currentTrack }
      open={ Boolean(showLyrics) }
      currentTime={ currentTime }
      duration={ duration } />
  </article>
}
