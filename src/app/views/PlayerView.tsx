import { useState, useEffect } from 'react'
import { useAudio, useLibrary } from '../contexts'
import { IconButton } from '../components/atomic'
import { Waveform } from '../components/atomic/Waveform'


export function PlayerView () {
  const { currentTrack, isPlaying, currentTime, duration, volume, play, pause, resume, seek, setVolume, playNext, playPrevious, analyzer } = useAudio()
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 'var(--sp-4)' }}>
        <div style={{ fontSize: 64, opacity: 0.3 }}>▶</div>
        <p style={{ color: 'var(--text-muted)' }}>No track playing</p>
        <small style={{ color: 'var(--text-muted)' }}>Select a track from the Library to start playing</small>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 'var(--sp-8)', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
          <button
            onClick={() =>
              setShowWaveform(false)}
            data-variant={showWaveform ? 'secondary' : 'primary'}
            data-size='sm'
            style={{
              padding:      'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--radius)',
              border:       'none',
              cursor:       'pointer',
              background:   showWaveform ? 'var(--bg-raised)' : 'var(--accent)',
              color:        showWaveform ? 'var(--text-dim)' : 'var(--text)',
            }}
          >
            Album Art
          </button>

          <button
            onClick={() =>
              setShowWaveform(true)}
            data-variant={showWaveform ? 'primary' : 'secondary'}
            data-size='sm'
            style={{
              padding:      'var(--sp-2) var(--sp-3)',
              borderRadius: 'var(--radius)',
              border:       'none',
              cursor:       'pointer',
              background:   showWaveform ? 'var(--accent)' : 'var(--bg-raised)',
              color:        showWaveform ? 'var(--text)' : 'var(--text-dim)',
            }}
          >
            Waveform
          </button>
        </div>

        {showWaveform
          ? <Waveform analyzer={analyzer} isPlaying={isPlaying} />
          : <div
            style={{
              width:          300,
              height:         300,
              background:     'var(--bg-raised)',
              borderRadius:   'var(--radius-lg)',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       80,
              boxShadow:      'var(--shadow-lg)',
              overflow:       'hidden',
            }}
          >
            {currentTrack.albumArt
              ? <img
                src={currentTrack.albumArt}
                alt='Album art'
                style={{
                  width:     '100%',
                  height:    '100%',
                  objectFit: 'cover',
                }}
              />
              : '♫'
            }
          </div>
        }

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--sp-2)' }}>{currentTrack.title}</h2>
          <p style={{ color: 'var(--text-dim)' }}>{currentTrack.artist}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{currentTrack.album}</p>
        </div>

        <div style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginBottom: 'var(--sp-2)' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 35 }}>{formatTime(currentTime)}</span>

            <div style={{ flex: 1, height: 4, background: 'var(--bg-hover)', borderRadius: 'var(--radius-full)', position: 'relative', cursor: 'pointer' }}>
              <div
                style={{
                  position:     'absolute',
                  left:         0,
                  top:          0,
                  height:       '100%',
                  width:        `${progress}%`,
                  background:   'var(--accent)',
                  borderRadius: 'var(--radius-full)',
                }}
              />

              <input
                type='range'
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={e =>
                  seek(Number(e.target.value))}
                style={{
                  position: 'absolute',
                  top:      0,
                  left:     0,
                  width:    '100%',
                  height:   '100%',
                  opacity:  0,
                  cursor:   'pointer',
                }}
              />
            </div>

            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 35, textAlign: 'right' }}>{formatTime(duration)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <IconButton label='Previous'
            onClick={() =>
              playPrevious(filteredTracks)}>
            ⏮
          </IconButton>

          <button
            data-variant='primary'
            data-icon
            onClick={isPlaying ? pause : resume}
            style={{ width: 56, height: 56, fontSize: 24 }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <IconButton label='Next'
            onClick={() =>
              playNext(filteredTracks)}>
            ⏭
          </IconButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', width: 200 }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>🔊</span>

          <input
            type='range'
            data-slider
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e =>
              setVolume(Number(e.target.value))}
            style={{ flex: 1 }}
          />

          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            {Math.round(volume * 100)}
            %
          </span>
        </div>
      </div>
    </div>
  )
}
