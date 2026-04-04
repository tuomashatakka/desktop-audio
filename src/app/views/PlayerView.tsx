import { useState } from 'react'
import { useAudio, useLibrary } from '../contexts'
import { IconButton, Button } from '../components/atomic'
import { Waveform } from '../components/atomic/Waveform'
import { WaveformProgress } from '../components/atomic/WaveformProgress'


function formatTime (seconds: number): string {
  if (!seconds || !Number.isFinite(seconds))
    return '0:00'

  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PlayerView () {
  const { currentTrack, isPlaying, currentTime, duration, waveformBars, pause, resume, seek, playNext, playPrevious, analyzer } = useAudio()
  const { filteredTracks } = useLibrary()
  const [ tab, setTab ] = useState<'player' | 'visualizer'>('player')

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

      {/* ─── Tab bar ──────────────────────────────── */}
      <nav className='player-tab-bar'>
        <button
          className={`player-tab ${tab === 'player' ? 'active' : ''}`}
          onClick={() =>
            setTab('player')}
        >
          <span className='tab-icon'>♪</span>
          Player
        </button>

        <button
          className={`player-tab ${tab === 'visualizer' ? 'active' : ''}`}
          onClick={() =>
            setTab('visualizer')}
        >
          <span className='tab-icon'>∿</span>
          Visualizer
        </button>
      </nav>

      {/* ─── Main content ─────────────────────────── */}
      <div className='player-content'>

        {tab === 'visualizer'
          ? <Waveform />
          : <>
            {/* Album art split card */}
            <figure className='album-art-card'>
              {currentTrack.albumArt
                ? <img src={currentTrack.albumArt} alt='Album art' />
                : <span className='art-fallback'>♫</span>
              }
            </figure>

            {/* Track info */}
            <div className='player-info'>
              <h2 className='track-title'>{currentTrack.title}</h2>
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
                barCount={75}
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
                onClick={() =>
                  playNext(filteredTracks)}
              >
                ⏭
              </IconButton>
            </div>
          </>
        }

      </div>
    </div>
  )
}
