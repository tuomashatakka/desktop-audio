import { useAudio, useLibrary } from '../../contexts'
import { useWindowSize } from '../../hooks'


// eslint-disable-next-line complexity
export function MiniPlayer () {
  const { currentTrack, isPlaying, pause, resume, playNext, playPrevious } = useAudio()
  const { filteredTracks } = useLibrary()
  const { width, height } = useWindowSize()

  // nano  — ≤ 80 wide or ≤ 80 tall : single play/pause button
  // tiny  — ≤ 160 wide              : art + play/pause
  // mini  — everything else (< 400) : art + title + full controls
  const nano = width <= 80 || height <= 80
  const tiny = !nano && width <= 160

  const sizeClass = nano ? 'mini-nano' : tiny ? 'mini-tiny' : 'mini-full'

  const bgStyle = currentTrack?.albumArt
    ? { backgroundImage: `url(${currentTrack.albumArt})` }
    : { background: currentTrack?.coverColor ?? 'var(--bg-raised)' }

  return (
    <div className={`mini-player ${sizeClass}`} style={bgStyle}>
      <div className='mini-drag-region' />

      {!nano &&
        <div className='mini-art' style={bgStyle} />
      }

      {!nano && !tiny &&
        <div className='mini-info'>
          <span className='mini-title'>{currentTrack?.title ?? 'Nothing playing'}</span>
          <span className='mini-artist'>{currentTrack?.artist ?? ''}</span>
        </div>
      }

      <div className='mini-controls'>
        {!nano &&
          <button
            className='mini-btn'
            aria-label='Previous'
            onClick={() =>
              currentTrack && playPrevious(filteredTracks)}
          >
            ⏮
          </button>
        }

        <button
          className='mini-btn mini-btn-play'
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={isPlaying ? pause : resume}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {!nano &&
          <button
            className='mini-btn'
            aria-label='Next'
            onClick={() =>
              currentTrack && playNext(filteredTracks)}
          >
            ⏭
          </button>
        }
      </div>
    </div>
  )
}
