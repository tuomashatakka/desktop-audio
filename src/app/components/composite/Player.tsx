import { useState } from 'react'
import { useUI, useAudio, useLibrary, useSettings } from '../../contexts'
import type { Track, RepeatMode } from '../../contexts'
import { Icon, IconButton, Button } from '../atomic'
import { WaveformProgress } from '../atomic/WaveformProgress'
import { useWindowScale } from '../../hooks'
import { formatTime, isoDuration } from '../../utils/time'


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
  return <figure className='player-art'>
    {/* Album art doubles as the compact/expanded window toggle, so the
          figure contains a real button rather than becoming clickable. */}
    <button
      className='album-art-card'
      aria-label='Toggle compact player size'
      type='button'
      disabled={ !track }
      onClick={ onToggle }>
      {track?.albumArt
        ? <img src={ track.albumArt } alt='' />
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

function playerAriaLabel (track: Track | null): string {
  return track ? `Now playing: ${track.title}` : 'Player'
}

/**
 * The one and only player.
 *
 * Mounted once, permanently, in the shell's footer — never conditionally
 * rendered per view. Whether it reads as a transport bar along the bottom or
 * as a full-window now-playing screen is decided entirely in CSS, off
 * `data-view` and `data-height-tier` on `.app-shell`. See `layout.css`.
 *
 * The class hooks here (`.player-view`, `.player-content`, `.album-art-card`,
 * `.player-info`, `.progress-section`, `.playback-controls`) are a deliberate
 * contract with the tier/container-query system; renaming them means rewriting
 * that system.
 */
export function Player () {
  const { setView, currentView } = useUI()
  const {
    currentTrack, isPlaying, currentTime, duration, waveformBars,
    pause, resume, seek, playNext, playPrevious,
  }                                                        = useAudio()
  const { filteredTracks }                                 = useLibrary()
  const { shuffle, setShuffle, repeatMode, setRepeatMode } = useSettings()
  const toggleWindowScale                                  = useWindowScale()

  const [ showLyrics, setShowLyrics ] = useState(false)

  // Lyrics only make sense in the full-window player; the footer bar and the
  // mini tiers have nowhere to put them, so the panel isn't in their DOM at
  // all rather than being hidden after the fact.
  const lyricsOpen = showLyrics && currentView === 'player'

  return <article
    className='player-view'
    data-empty={ currentTrack ? undefined : '' }
    data-lyrics={ lyricsOpen ? '' : undefined }
    aria-label={ playerAriaLabel(currentTrack) }>
    {currentTrack?.albumArt &&
        <div className='album-art-bg' aria-hidden='true'>
          <img src={ currentTrack.albumArt } alt='' />
        </div>
    }

    <button
      className='player-promote'
      aria-label='Open now playing'
      type='button'
      disabled={ !currentTrack }
      onClick={ () =>
        setView('player') } />

    <div className='player-content'>
      <PlayerArtwork track={ currentTrack } onToggle={ toggleWindowScale } />

      {/* The inner span on the title is the marquee track: it sizes to the
            text so CSS can compare it against the title box and scroll only
            the overflow. See `.track-title` in layout.css. */}
      <hgroup className='player-info'>
        <h2 className='track-title'>
          <span>{currentTrack?.title ?? 'Nothing playing'}</span>
        </h2>

        <p className='track-artist'>{currentTrack?.artist}</p>
        <p className='track-album'>{currentTrack?.album}</p>
      </hgroup>

      {/* A menu of controls, like `.playback-controls` below — same shape so
          the two read alike and neither is a bare <div>. */}
      <menu className='player-actions' aria-label='Player'>
        <li>
          <IconButton
            className='lyrics-toggle'
            aria-pressed={ showLyrics }
            label={ showLyrics ? 'Show playback controls' : 'Show lyrics' }
            type='button'
            disabled={ !currentTrack }
            onClick={ () =>
              setShowLyrics(current =>
                !current) }>
            <Icon name='lyrics' />
          </IconButton>
        </li>

        <li>
          <IconButton
            className='player-close'
            label='Close player'
            type='button'
            onClick={ () =>
              setView('library') }>
            <Icon name='close' />
          </IconButton>
        </li>
      </menu>

      {lyricsOpen && <PlayerLyrics lyrics={ currentTrack?.lyrics } />}

      <section className='progress-section' aria-label='Playback position'>
        <WaveformProgress
          currentTime={ currentTime }
          duration={ duration }
          bars={ waveformBars }
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
        onPrevious={ () =>
          playPrevious(filteredTracks) }
        onToggle={ isPlaying ? pause : resume }
        onNext={ () =>
          playNext(filteredTracks) }
        onShuffle={ () =>
          setShuffle(!shuffle) }
        onRepeat={ () =>
          setRepeatMode(REPEAT_CYCLE[repeatMode]) } />
    </div>
  </article>
}
