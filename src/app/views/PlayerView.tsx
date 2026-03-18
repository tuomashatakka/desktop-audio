import { useState } from 'react'
import { useAudio, useLibrary } from '../contexts'
import { IconButton, Button } from '../components/atomic'
import { Waveform } from '../components/atomic/Waveform'
import './PlayerView.css'


export function PlayerView () {
  const { currentTrack, isPlaying, currentTime, duration, volume, pause, resume, seek, setVolume, playNext, playPrevious, analyzer } = useAudio()
  const { filteredTracks } = useLibrary()
  const [ showWaveform, setShowWaveform ] = useState(false)

  const formatTime = (seconds: number) => {
    if (!seconds || !Number.isFinite(seconds))
      return '0:00'

    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? currentTime / duration * 100 : 0

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
      <div className='player-content'>
        <div className='view-toggle'>
          <Button
            onClick={() =>
              setShowWaveform(false)}
            variant={showWaveform ? 'secondary' : 'primary'}
            size='sm'
          >
            Album Art
          </Button>

          <Button
            onClick={() =>
              setShowWaveform(true)}
            variant={showWaveform ? 'primary' : 'secondary'}
            size='sm'
          >
            Waveform
          </Button>
        </div>

        {showWaveform
          ? <Waveform analyzer={analyzer} isPlaying={isPlaying} />
          : <div className='album-art-container'>
            {currentTrack.albumArt
              ? <img
                src={currentTrack.albumArt}
                alt='Album art'
              />
              : '♫'
            }
          </div>
        }

        <div className='player-info'>
          <h2>{currentTrack.title}</h2>
          <p className='track-artist'>{currentTrack.artist}</p>
          <p className='track-album'>{currentTrack.album}</p>
        </div>

        <div className='progress-section'>
          <div className='progress-bar-container'>
            <span className='time-label'>{formatTime(currentTime)}</span>

            <div className='progress-track'>
              <div
                className='progress-fill'
                style={{ width: `${progress}%` }}
              />

              <input
                type='range'
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={e =>
                  seek(Number(e.target.value))}
              />
            </div>

            <span className='time-label total'>{formatTime(duration)}</span>
          </div>
        </div>

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

        <div className='volume-controls'>
          <span className='volume-icon'>🔊</span>

          <input
            type='range'
            className='slider volume-slider'
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e =>
              setVolume(Number(e.target.value))}
          />

          <span className='volume-value'>
            {Math.round(volume * 100)}
            %
          </span>
        </div>
      </div>
    </div>
  )
}
