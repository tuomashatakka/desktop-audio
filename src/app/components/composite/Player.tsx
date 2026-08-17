import { useUI, useAudio, useSettings } from '../../contexts'
import { FrequencyMatrix } from './FrequencyMatrix'
import { DspPanel } from './DspPanel'
import type { Track, RepeatMode, PlayerMode } from '../../contexts'
import { Icon, IconButton, Button } from '../atomic'
import { WaveformProgress } from '../atomic/WaveformProgress'
import { useTrackAnalysis, useWindowScale } from '../../hooks'
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
 * The lyrics panel, which takes the place of the progress bar and transport
 * in the full-window player. Rendered whenever it is toggled on — whether it
 * is *visible* is the tier stylesheet's call, since the compact tiers have no
 * room for it.
 */
type PlayerLyricsProps = { readonly lyrics?: string }

function PlayerLyrics ({ lyrics }: PlayerLyricsProps) {
  return <section className='player-lyrics' aria-label='Lyrics'>
    {lyrics
      ? <pre>{lyrics}</pre>
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

type PlayerPanelProps = {
  readonly mode:              PlayerMode
  readonly lyrics?:           string
  readonly analyzer:          AnalyserNode | null
  readonly analysis:          TrackAnalysisState
  readonly currentTime:       number
  readonly showChordAnalysis: boolean
  readonly showKeyAnalysis:   boolean
}

/** Whatever the chosen mode puts in the middle of the screen. */
function PlayerPanel ({ mode, lyrics, analyzer, analysis, currentTime, showChordAnalysis, showKeyAnalysis }: PlayerPanelProps) {
  if (mode === 'lyrics')
    return <PlayerLyrics lyrics={ lyrics } />

  if (mode === 'visualizer')
    return <FrequencyMatrix
      analyzer={ analyzer }
      active
      analysis={ analysis.analysis }
      status={ analysis.status }
      error={ analysis.error }
      currentTime={ currentTime }
      showChordAnalysis={ showChordAnalysis }
      showKeyAnalysis={ showKeyAnalysis } />

  if (mode === 'dsp')
    return <DspPanel />

  return null
}

type PlayerActionsProps = {
  readonly mode:     PlayerMode
  readonly hasTrack: boolean
  readonly onMode:   (mode: Exclude<PlayerMode, 'default'>) => void
  readonly onClose:  () => void
}

/**
 * The overlay's top-right controls: pick what fills the middle, or leave.
 *
 * A menu of controls, like `.playback-controls` — same shape, so the two read
 * alike and neither is a bare `<div>`. Each mode button is `aria-pressed`
 * rather than a radio group: they are toggles that also happen to be mutually
 * exclusive, and pressing the active one returns to the artwork.
 */
function PlayerActions ({ mode, hasTrack, onMode, onClose }: PlayerActionsProps) {
  const showing = (target: Exclude<PlayerMode, 'default'>) =>
    mode === target

  return <menu className='player-actions' aria-label='Player'>
    <li>
      <IconButton
        className='visualizer-toggle'
        aria-pressed={ showing('visualizer') }
        label={ showing('visualizer') ? 'Show album art' : 'Show frequency spectrum' }
        type='button'
        disabled={ !hasTrack }
        onClick={ () =>
          onMode('visualizer') }>
        <Icon name='spectrum' />
      </IconButton>
    </li>

    <li>
      <IconButton
        className='lyrics-toggle'
        aria-pressed={ showing('lyrics') }
        label={ showing('lyrics') ? 'Show album art' : 'Show lyrics' }
        type='button'
        disabled={ !hasTrack }
        onClick={ () =>
          onMode('lyrics') }>
        <Icon name='lyrics' />
      </IconButton>
    </li>

    {/* No `disabled` here, unlike the two above: the spectrum and lyrics need a
        track to have anything to show, but an EQ curve is editable in silence. */}
    <li>
      <IconButton
        className='dsp-toggle'
        aria-pressed={ showing('dsp') }
        label={ showing('dsp') ? 'Show album art' : 'Show audio processing' }
        type='button'
        onClick={ () =>
          onMode('dsp') }>
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
  const { openOverlay, closeOverlay, playerMode, setPlayerMode } = useUI()
  const {
    currentTrack, isPlaying, currentTime, duration, waveformBars, analyzer,
    pause, resume, seek, playNext, playPrevious,
  }                                                        = useAudio()
  const { shuffle, setShuffle, repeatMode, setRepeatMode,
    showBeatMarkers, showChordAnalysis, showKeyAnalysis } = useSettings()
  const analysis                                          = useTrackAnalysis(currentTrack?.id)
  const toggleWindowScale                                 = useWindowScale()

  /**
   * Clicking the active mode's button returns to the artwork. The value lives
   * in `UIContext` so the sidebar can open the overlay straight onto a mode.
   */
  const toggleMode = (next: Exclude<PlayerMode, 'default'>) =>
    setPlayerMode(playerMode === next ? 'default' : next)

  // These panels only make sense in the full-window player; the footer bar and
  // the mini tiers have nowhere to put them, so they aren't in their DOM at
  // all rather than being hidden after the fact.
  const activeMode = expanded ? playerMode : 'default'

  // Shares the cache entry `PlayerArt` above already warmed for this track.
  const currentArt = useArtwork(currentTrack?.id, 'full')

  return <article
    className='player-view'
    data-empty={ currentTrack ? undefined : '' }
    data-mode={ activeMode === 'default' ? undefined : activeMode }
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

      {/* A menu of controls, like `.playback-controls` below — same shape so
          the two read alike and neither is a bare <div>. Only the overlay has
          anywhere to put it. */}
      {expanded &&
        <PlayerActions
          mode={ activeMode }
          hasTrack={ Boolean(currentTrack) }
          onMode={ toggleMode }
          onClose={ closeOverlay } />
      }

      <PlayerPanel
        mode={ activeMode }
        lyrics={ currentTrack?.lyrics }
        analyzer={ analyzer }
        analysis={ analysis }
        currentTime={ currentTime }
        showChordAnalysis={ showChordAnalysis }
        showKeyAnalysis={ showKeyAnalysis } />

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
  </article>
}
