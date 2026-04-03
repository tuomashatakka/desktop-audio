import { useState } from 'react'
import { useUI, useLibrary } from '../contexts'
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
      <div className='tag-editor-view'>
        <div className='empty-state'>
          <p>No track selected</p>
        </div>
      </div>
    )
  }

  return (
    <div className='tag-editor-view'>
      <header className='header'>
        <h2>Edit Tags</h2>

        <Button
          variant='ghost'
          onClick={() =>
            setView('library')}
        >
          ← Back
        </Button>
      </header>

      <div className='editor-layout'>
        <div className='art-preview'>
          ♫
        </div>

        <div className='form-stack stack sm'>
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

          <div className='file-info'>
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

      <footer className='footer-actions'>
        <Button
          variant='ghost'
          onClick={() =>
            setView('library')}
        >
          Cancel
        </Button>

        <Button variant='primary' onClick={handleSave}>Save Changes</Button>
      </footer>
    </div>
  )
}
