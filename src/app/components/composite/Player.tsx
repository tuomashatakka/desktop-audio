import { useUI, useAudio, useLibrary } from '../../contexts'
import type { Track } from '../../contexts'
import { IconButton, Button } from '../atomic'
import { WaveformProgress } from '../atomic/WaveformProgress'
import { useWindowScale } from '../../hooks'
import { formatTime, isoDuration } from '../../utils/time'


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
          : <span className='art-fallback' aria-hidden='true'>♫</span>
        }
      </button>
    </figure>
  )
}

function PlayerTransport ({ hasTrack, isPlaying, onPrevious, onToggle, onNext }: {
  readonly hasTrack:   boolean
  readonly isPlaying:  boolean
  readonly onPrevious: () => void
  readonly onToggle:   () => void
  readonly onNext:     () => void
}) {
  return (
    <menu className='playback-controls' aria-label='Playback'>
      <li className='prev'>
        <IconButton label='Previous' type='button' disabled={!hasTrack} onClick={onPrevious}>
          <span aria-hidden='true'>⏮</span>
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
          <span aria-hidden='true'>{isPlaying ? '⏸' : '▶'}</span>
        </Button>
      </li>

      <li className='next'>
        <IconButton label='Next' type='button' disabled={!hasTrack} onClick={onNext}>
          <span aria-hidden='true'>⏭</span>
        </IconButton>
      </li>
    </menu>
  )
}

function PlayerVolume ({ hasTrack, volume, onChange }: {
  readonly hasTrack: boolean
  readonly volume:   number
  readonly onChange: (volume: number) => void
}) {
  const muted = volume === 0

  return (
    <div className='player-volume'>
      <IconButton
        label={muted ? 'Unmute' : 'Mute'}
        type='button'
        disabled={!hasTrack}
        onClick={() =>
          onChange(muted ? 0.8 : 0)}
      >
        <span aria-hidden='true'>{muted ? '🔇' : '🔊'}</span>
      </IconButton>

      <input
        type='range'
        className='slider volume-slider'
        aria-label='Volume'
        disabled={!hasTrack}
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={e =>
          onChange(Number(e.target.value))}
      />
    </div>
  )
}


/**
 * The one and only player.
 *
 * Mounted once, permanently, in the shell's footer — never conditionally
 * rendered per view. Whether it reads as a transport bar along the bottom or
 * as a full-window now-playing screen is decided entirely in CSS, off
 * `data-view` and `data-height-tier` on `.app-shell`. See `player.css`.
 *
 * The class hooks here (`.player-view`, `.player-content`, `.album-art-card`,
 * `.player-info`, `.progress-section`, `.playback-controls`) are a deliberate
 * contract with the tier/container-query system; renaming them means rewriting
 * that system.
 */
export function Player () {
  const { setView } = useUI()
  const {
    currentTrack, isPlaying, currentTime, duration, volume, waveformBars,
    pause, resume, seek, setVolume, playNext, playPrevious,
  } = useAudio()
  const { filteredTracks } = useLibrary()
  const toggleWindowScale = useWindowScale()

  return (
    <article
      className='player-view'
      data-empty={currentTrack ? undefined : ''}
      aria-label={currentTrack ? `Now playing: ${currentTrack.title}` : 'Player'}
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
            the overflow. See `.track-title` in player.css. */}
        <hgroup className='player-info'>
          <h2 className='track-title'>
            <span>{currentTrack?.title ?? 'Nothing playing'}</span>
          </h2>

          <p className='track-artist'>{currentTrack?.artist}</p>
          <p className='track-album'>{currentTrack?.album}</p>
        </hgroup>

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
        />

        <PlayerVolume
          hasTrack={Boolean(currentTrack)}
          volume={volume}
          onChange={setVolume}
        />
      </div>
    </article>
  )
}
