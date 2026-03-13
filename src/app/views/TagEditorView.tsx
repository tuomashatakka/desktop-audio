import { useState } from 'react'
import { useUI, useLibrary } from '../contexts'
import type { Track } from '../contexts'
import { Button, Input } from '../components/atomic'


export function TagEditorView () {
  const { setView, editingTrackId } = useUI()
  const { tracks } = useLibrary()

  const track = tracks.find(t =>
    t.id === editingTrackId) || tracks[0]

  const [ formData, setFormData ] = useState({
    title:  track?.title || '',
    artist: track?.artist || '',
    album:  track?.album || '',
  })

  const handleSave = () => {
    console.log('Saving metadata:', formData)
    alert('Metadata saved (demo)')
    setView('library')
  }

  if (!track) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--text-muted)' }}>No track selected</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 'var(--sp-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-6)' }}>
        <h2>Edit Tags</h2>

        <Button variant='ghost'
          onClick={() =>
            setView('library')}>
          ← Back
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-6)' }}>
        <div
          style={{
            width:          200,
            height:         200,
            background:     'var(--bg-raised)',
            borderRadius:   'var(--radius-lg)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            fontSize:       48,
          }}
        >
          ♫
        </div>

        <div style={{ flex: 1 }} data-stack='sm'>
          <Input
            label='Title'
            value={formData.title}
            onChange={e =>
              setFormData(s =>
                ({ ...s, title: e.target.value }))}
          />

          <Input
            label='Artist'
            value={formData.artist}
            onChange={e =>
              setFormData(s =>
                ({ ...s, artist: e.target.value }))}
          />

          <Input
            label='Album'
            value={formData.album}
            onChange={e =>
              setFormData(s =>
                ({ ...s, album: e.target.value }))}
          />

          <div style={{ marginTop: 'var(--sp-4)', padding: 'var(--sp-3)', background: 'var(--bg-input)', borderRadius: 'var(--radius)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            <p>
              <strong>File:</strong>
              {' '}
              {track.path}
            </p>

            <p>
              <strong>Format:</strong>
              {' '}
              {track.format}
            </p>

            <p>
              <strong>Duration:</strong>
              {' '}
              {Math.floor(track.duration / 60)}
              :
              {String(track.duration % 60).padStart(2, '0')}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end', marginTop: 'var(--sp-6)' }}>
        <Button variant='ghost'
          onClick={() =>
            setView('library')}>
          Cancel
        </Button>

        <Button variant='primary' onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  )
}
