import { useUI, useAudio, useLibrary } from '../../contexts'
import { IconButton } from '../atomic'


export function PlayerBar () {
  const { playerExpanded, togglePlayerExpanded } = useUI()
  const { isPlaying, currentTrack, currentTime, duration, volume, pause, resume, seek, setVolume, playNext, playPrevious } = useAudio()
  const { filteredTracks } = useLibrary()

  if (!currentTrack)
    return null

  const formatTime = (seconds: number) => {
    if (!seconds || !Number.isFinite(seconds))
      return '0:00'

    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handlePlayerBarClick = () => {
    togglePlayerExpanded()
  }

  return (
    <section
      className={`player-bar ${playerExpanded ? 'player-bar-hidden' : ''}`}
      onClick={handlePlayerBarClick}
    >
      <div className='player-bar-track'>
        <div className='player-bar-art'>
          {currentTrack.albumArt
            ? <img src={currentTrack.albumArt} alt='Album art' />
            : <span className='art-placeholder'>♫</span>
          }
        </div>

        <div className='player-bar-info'>
          <div className='player-bar-title'>{currentTrack.title}</div>
          <div className='player-bar-artist'>{currentTrack.artist}</div>
        </div>
      </div>

      <div className='player-bar-controls' onClick={e =>
        e.stopPropagation()}>
        <IconButton
          label='Previous'
          onClick={() =>
            playPrevious(filteredTracks)}
        >
          ⏮
        </IconButton>

        <IconButton
          label={isPlaying ? 'Pause' : 'Play'}
          onClick={isPlaying ? pause : resume}
        >
          {isPlaying ? '⏸' : '▶'}
        </IconButton>

        <IconButton
          label='Next'
          onClick={() =>
            playNext(filteredTracks)}
        >
          ⏭
        </IconButton>
      </div>

      <div className='player-bar-progress' onClick={e =>
        e.stopPropagation()}>
        <span className='player-bar-time'>{formatTime(currentTime)}</span>

        <input
          type='range'
          className='slider'
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={e =>
            seek(Number(e.target.value))}
        />

        <span className='player-bar-time'>{formatTime(duration)}</span>
      </div>

      <div className='player-bar-volume' onClick={e =>
        e.stopPropagation()}>
        <IconButton
          label='Volume'
          onClick={() =>
            setVolume(volume > 0 ? 0 : 0.8)}
        >
          {volume > 0 ? '🔊' : '🔇'}
        </IconButton>

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
      </div>
    </section>
  )
}
