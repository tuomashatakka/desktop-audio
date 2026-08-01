import { useState } from 'react'
import type { FormEvent } from 'react'
import { useUI, useLibrary } from '../contexts'
import type { Track } from '../models'
import { Button, Input } from '../components/atomic'
import { formatTime, isoDuration } from '../utils/time'


interface TagEditorFormProps {
  readonly track:   Track
  readonly onClose: () => void
}

function TagEditorForm ({ track, onClose }: TagEditorFormProps) {
  const [ formData, setFormData ] = useState({
    title:  track.title,
    artist: track.artist,
    album:  track.album,
  })

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    console.log('Saving metadata:', formData)
    alert('Metadata saved (demo)')
    onClose()
  }

  return (
    <article className='tag-editor-view'>
      <header className='tag-editor-header'>
        <h2>Edit Tags</h2>
        <Button type='button' variant='ghost' onClick={onClose}>← Back</Button>
      </header>

      <form onSubmit={handleSave}>
        <div className='editor-layout'>
          <figure className='art-preview' style={{ backgroundColor: track.coverColor }}>
            {track.albumArt
              ? <img src={track.albumArt} alt={`Album artwork for ${track.album}`} />
              : <span aria-hidden='true'>♫</span>
            }
          </figure>

          <div className='form-stack'>
            <Input
              label='Title'
              value={formData.title}
              onChange={event =>
                setFormData(current =>
                  ({ ...current, title: event.target.value }))}
            />

            <Input
              label='Artist'
              value={formData.artist}
              onChange={event =>
                setFormData(current =>
                  ({ ...current, artist: event.target.value }))}
            />

            <Input
              label='Album'
              value={formData.album}
              onChange={event =>
                setFormData(current =>
                  ({ ...current, album: event.target.value }))}
            />

            <dl className='file-info'>
              <div>
                <dt>File</dt>
                <dd>{track.path}</dd>
              </div>

              <div>
                <dt>Format</dt>
                <dd>{track.format}</dd>
              </div>

              <div>
                <dt>Duration</dt>
                <dd><time dateTime={isoDuration(track.duration)}>{formatTime(track.duration)}</time></dd>
              </div>
            </dl>
          </div>
        </div>

        <footer className='footer-actions'>
          <Button type='button' variant='ghost' onClick={onClose}>Cancel</Button>
          <Button type='submit' variant='primary'>Save Changes</Button>
        </footer>
      </form>
    </article>
  )
}

export function TagEditorView () {
  const { setView, editingTrackId } = useUI()
  const { registry } = useLibrary()
  const tracks = registry.getAllTracks()
  const track = tracks.find(candidate =>
    candidate.id === editingTrackId) || tracks[0]

  if (!track) {
    return (
      <article className='tag-editor-view empty-state'>
        <p>No track selected</p>
      </article>
    )
  }

  return (
    <TagEditorForm
      key={track.id}
      track={track}
      onClose={() =>
        setView('library')}
    />
  )
}
