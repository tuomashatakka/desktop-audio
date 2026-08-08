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


function PlayerArtwork ({ track, onToggle }: {
  readonly track:    Track | null
  readonly onToggle: () => void
}) {
  return (
    <figure className='player-art'>
      {/* Album art doubles as the compact/expanded window toggle, so the
          figure contains a real button rather than becoming clickable. */}
      <button
        type='button'
        className='album-art-card'
        aria-label='Toggle compact player size'
        disabled={!track}
        onClick={onToggle}
      >
        {track?.albumArt
          ? <img src={track.albumArt} alt='' />
          : <Icon className='art-fallback' name='music' />
        }
      </button>
    </figure>
  )
}

function PlayerTransport ({
  hasTrack, isPlaying, onPrevious, onToggle, onNext,
  shuffle, onShuffle, repeatMode, onRepeat,
}: {
  readonly hasTrack:   boolean
  readonly isPlaying:  boolean
  readonly onPrevious: () => void
  readonly onToggle:   () => void
  readonly onNext:     () => void

  readonly shuffle:    boolean
  readonly onShuffle:  () => void
  readonly repeatMode: RepeatMode
  readonly onRepeat:   () => void
}) {
  return (
    <menu className='playback-controls' aria-label='Playback'>
      {/* Shuffle and repeat sit inside the transport rather than beside it:
          they're modes of the same control group, and the tier rules only
          have to shed one element to drop both. */}
      <li className='mode shuffle'>
        <IconButton
          label={shuffle ? 'Shuffle on' : 'Shuffle off'}
          type='button'
          aria-pressed={shuffle}
          data-active={shuffle || undefined}
          onClick={onShuffle}
        >
          <Icon name='shuffle' />
        </IconButton>
      </li>

      <li className='prev'>
        <IconButton label='Previous' type='button' disabled={!hasTrack} onClick={onPrevious}>
          <Icon name='previous' />
        </IconButton>
      </li>

      <li className='play'>
        <Button
          variant='primary'
          className='play-pause-btn'
          icon
          type='button'
          aria-label={isPlaying ? 'Pause' : 'Play'}
          aria-pressed={isPlaying}
          disabled={!hasTrack}
          onClick={onToggle}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </Button>
      </li>

      <li className='next'>
        <IconButton label='Next' type='button' disabled={!hasTrack} onClick={onNext}>
          <Icon name='next' />
        </IconButton>
      </li>

      <li className='mode repeat'>
        <IconButton
          label={REPEAT_LABEL[repeatMode]}
          type='button'
          data-repeat={repeatMode}
          data-active={repeatMode === 'none' ? undefined : true}
          onClick={onRepeat}
        >
          <Icon name='repeat' />
          {repeatMode === 'one' && <span className='mode-badge' aria-hidden='true'>1</span>}
        </IconButton>
      </li>
    </menu>
  )
}

/**
 * The lyrics panel, which takes the place of the progress bar and transport
 * in the full-window player. Rendered whenever it is toggled on — whether it
 * is *visible* is the tier stylesheet's call, since the compact tiers have no
 * room for it.
 */
function PlayerLyrics ({ lyrics }: { readonly lyrics?: string }) {
  return (
    <section className='player-lyrics' aria-label='Lyrics'>
      {lyrics
        ? <pre>{lyrics}</pre>
        : <p className='status-message'>No lyrics in this file&apos;s tags</p>
      }
    </section>
  )
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
  } = useAudio()
  const { filteredTracks } = useLibrary()
  const { shuffle, setShuffle, repeatMode, setRepeatMode } = useSettings()
  const toggleWindowScale = useWindowScale()

  const [ showLyrics, setShowLyrics ] = useState(false)

  // Lyrics only make sense in the full-window player; the footer bar and the
  // mini tiers have nowhere to put them, so the panel isn't in their DOM at
  // all rather than being hidden after the fact.
  const lyricsOpen = showLyrics && currentView === 'player'

  return (
    <article
      className='player-view'
      data-empty={currentTrack ? undefined : ''}
      data-lyrics={lyricsOpen ? '' : undefined}
      aria-label={playerAriaLabel(currentTrack)}
    >
      {currentTrack?.albumArt &&
        <div className='album-art-bg' aria-hidden='true'>
          <img src={currentTrack.albumArt} alt='' />
        </div>
      }

      <button
        type='button'
        className='player-promote'
        aria-label='Open now playing'
        disabled={!currentTrack}
        onClick={() =>
          setView('player')}
      />

      <div className='player-content'>
        <PlayerArtwork track={currentTrack} onToggle={toggleWindowScale} />

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

        <div className='player-actions'>
          <IconButton
            label={showLyrics ? 'Show playback controls' : 'Show lyrics'}
            type='button'
            className='lyrics-toggle'
            aria-pressed={showLyrics}
            disabled={!currentTrack}
            onClick={() =>
              setShowLyrics(current =>
                !current)}
          >
            <Icon name='lyrics' />
          </IconButton>

          <IconButton
            label='Close player'
            type='button'
            className='player-close'
            onClick={() =>
              setView('library')}
          >
            <Icon name='close' />
          </IconButton>
        </div>

        {lyricsOpen && <PlayerLyrics lyrics={currentTrack?.lyrics} />}

        <section className='progress-section' aria-label='Playback position'>
          <WaveformProgress
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            bars={waveformBars}
          />

          <div className='time-row'>
            <time className='time-label' dateTime={isoDuration(currentTime)}>
              {formatTime(currentTime)}
            </time>

            <time className='time-label' dateTime={isoDuration(duration)}>
              {formatTime(duration)}
            </time>
          </div>
        </section>

        <PlayerTransport
          hasTrack={Boolean(currentTrack)}
          isPlaying={isPlaying}
          onPrevious={() =>
            playPrevious(filteredTracks)}
          onToggle={isPlaying ? pause : resume}
          onNext={() =>
            playNext(filteredTracks)}
          shuffle={shuffle}
          onShuffle={() =>
            setShuffle(!shuffle)}
          repeatMode={repeatMode}
          onRepeat={() =>
            setRepeatMode(REPEAT_CYCLE[repeatMode])}
        />
      </div>
    </article>
  )
}
