import { useAudio, useLibrary } from '../contexts'
import { IconButton, Button } from '../components/atomic'
import { WaveformProgress } from '../components/atomic/WaveformProgress'
import { useWindowScale } from '../hooks'


/** `m:ss` for a playback position; `0:00` for missing/non-finite input. */
function formatTime (seconds: number): string {
  if (!seconds || !Number.isFinite(seconds))
    return '0:00'

  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PlayerView () {
  const { currentTrack, isPlaying, currentTime, duration, waveformBars, pause, resume, seek, playNext, playPrevious } = useAudio()
  const { filteredTracks } = useLibrary()

  // Must run before the early return — hooks cannot be conditional.
  const toggleWindowScale = useWindowScale()

  if (!currentTrack) {
    return (
      <div className='player-view'>
        <div className='empty-player'>
          <div className='empty-icon'>▶</div>
          <p>No track playing</p>
          <small>Select a track from the Library to start playing</small>
        </div>
      </div>
    )
  }

  return (
    <div className='player-view'>

      {currentTrack?.albumArt &&
        <div className='album-art-bg' aria-hidden='true'>
          <img src={currentTrack.albumArt} alt='' />
        </div>
      }

      <div className='player-content'>
        {/* Album art — doubles as the compact/expanded window toggle */}
        <button
          type='button'
          className='album-art-card'
          aria-label='Toggle compact player size'
          onClick={toggleWindowScale}
        >
          {currentTrack.albumArt
            ? <img src={currentTrack.albumArt} alt='Album art' />
            : <span className='art-fallback'>♫</span>
          }
        </button>

        {/* Track info */}
        <div className='player-info'>
          {/* The inner span is the marquee track: it sizes to the text so CSS
              can compare it against the title box and scroll only the
              overflow. See `.track-title` in player.css. */}
          <h2 className='track-title'><span>{currentTrack.title}</span></h2>
          <p className='track-artist'>{currentTrack.artist}</p>
          <p className='track-album'>{currentTrack.album}</p>
        </div>

        {/* Waveform progress */}
        <section className='progress-section'>
          <WaveformProgress
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            bars={waveformBars}
          />

          <div className='time-row'>
            <span className='time-label'>{formatTime(currentTime)}</span>
            <span className='time-label'>{formatTime(duration)}</span>
          </div>
        </section>

        {/* Playback controls */}
        <div className='playback-controls'>
          <IconButton
            label='Previous'
            className='prev-btn'
            onClick={() =>
              playPrevious(filteredTracks)}
          >
            ⏮
          </IconButton>

          <Button
            variant='primary'
            className='play-pause-btn'
            icon
            onClick={isPlaying ? pause : resume}
          >
            {isPlaying ? '⏸' : '▶'}
          </Button>

          <IconButton
            label='Next'
            className='next-btn'
            onClick={() =>
              playNext(filteredTracks)}
          >
            ⏭
          </IconButton>
        </div>
      </div>
    </div>
  )
}
