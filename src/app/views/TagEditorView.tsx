/* eslint-disable react-strict/no-style-prop -- The artwork preview paints the
   track's own image data or its generated cover colour. */
/**
 * TagEditorView — edits every tag the library stores for a track.
 *
 * Two things worth knowing before changing this:
 *
 * 1. Saving writes to the app's own database, **not** into the audio file.
 *    Nothing in the dependency tree can write ID3/Vorbis frames, so the tags
 *    shown across the app are the edited ones while the file on disk is
 *    untouched. The scanner cooperates: an edit leaves `mtime_ms` alone, so
 *    the next scan sees an unchanged file, serves the stored row, and the
 *    edit survives.
 * 2. Only the seven fields in `PRIMARY_TAG_FIELDS` are shown up front. The
 *    rest — and there are a lot of them — live behind a disclosure, because a
 *    twenty-field wall is not a form anyone reads.
 */
import { useState, useRef } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useUI, useLibrary } from '../contexts'
import type { Track } from '../models'
import type { TagField, TrackDTO } from '../services/types'
import { PRIMARY_TAG_FIELDS, EXTENDED_TAG_FIELDS } from '../services/types'
import { useData } from '../data'
import { useArtwork } from '../hooks/useArtwork'
import { Button, Icon, Input, Rating } from '../components/atomic'
import { formatTime, isoDuration } from '../utils/time'


/** Label and input type per editable field. Numeric fields parse on save. */
/** How a tag field is presented: its visible label and which control it gets. */
interface TagFieldMeta {
  label: string
  type:  'text' | 'number' | 'multiline' | 'rating'
}

const FIELD_META: Record<TagField, TagFieldMeta> = {
  title:       { label: 'Title', type: 'text' },
  artist:      { label: 'Artist', type: 'text' },
  album:       { label: 'Album', type: 'text' },
  albumArtist: { label: 'Album Artist', type: 'text' },
  year:        { label: 'Year', type: 'number' },
  genre:       { label: 'Genre', type: 'text' },
  trackNumber: { label: 'Track No.', type: 'number' },
  rating:      { label: 'Rating', type: 'rating' },
  composer:    { label: 'Composer', type: 'text' },
  trackTotal:  { label: 'Track Total', type: 'number' },
  discNumber:  { label: 'Disc No.', type: 'number' },
  discTotal:   { label: 'Disc Total', type: 'number' },
  bpm:         { label: 'BPM', type: 'number' },
  publisher:   { label: 'Publisher', type: 'text' },
  copyright:   { label: 'Copyright', type: 'text' },
  isrc:        { label: 'ISRC', type: 'text' },
  encodedBy:   { label: 'Encoded By', type: 'text' },
  language:    { label: 'Language', type: 'text' },
  mood:        { label: 'Mood', type: 'text' },
  grouping:    { label: 'Grouping', type: 'text' },
  comment:     { label: 'Comment', type: 'multiline' },
  lyrics:      { label: 'Lyrics', type: 'multiline' },
}

/** Every editable field as a string, which is what form controls deal in. */
type FormState = Record<TagField, string>

const ALL_FIELDS: readonly TagField[] = [ ...PRIMARY_TAG_FIELDS, ...EXTENDED_TAG_FIELDS ]

/** Textarea heights: lyrics get a real column, other free text a few lines. */
const LYRICS_ROWS    = 10
const MULTILINE_ROWS = 3

function readForm (track: Track): FormState {
  const source = track as unknown as Record<string, unknown>
  const state  = {} as FormState

  for (const field of ALL_FIELDS) {
    const value  = source[field]
    state[field] = value === undefined || value === null ? '' : String(value)
  }
  return state
}

/** Empty string means "no tag", not "the number zero" — hence the blank check. */
function parseField (field: TagField, value: string): string | number | undefined {
  const trimmed = value.trim()
  if (!trimmed)
    return undefined

  if (!(FIELD_META[field].type === 'number' || FIELD_META[field].type === 'rating'))
    return trimmed

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

type TagInputsProps = {
  readonly fields:   readonly TagField[]
  readonly form:     FormState
  readonly onChange: (field: TagField, value: string) => void
}

type TagInputProps = {
  readonly field:    TagField
  readonly value:    string
  readonly onChange: (field: TagField, value: string) => void
}

/**
 * One tag row. Split out of `TagInputs` so the map callback stays a plain
 * projection rather than a component definition inlined in JSX.
 */
function TagInput ({ field, value, onChange }: TagInputProps) {
  const { label, type } = FIELD_META[field]

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(field, event.target.value)

  // A rating is a fixed 0-5 scale, so it gets a control that says so rather
  // than a number box the user has to guess the range of. `0` clears it,
  // which `parseField` maps back to "no tag" via the blank string.
  if (type === 'rating')
    return <div className='field rating-field'>
      <span>{label}</span>

      <Rating
        legend={ label }
        value={ value ? Number(value) : undefined }
        onChange={ next =>
          onChange(field, next ? String(next) : '') } />
    </div>

  if (type === 'multiline')
    return <label className='field'>
      <span>{label}</span>

      <textarea
        rows={ field === 'lyrics' ? LYRICS_ROWS : MULTILINE_ROWS }
        value={ value }
        onChange={ handleChange } />
    </label>

  return <Input
    label={ label }
    type={ type }
    value={ value }
    onChange={ handleChange } />
}

function TagInputs ({ fields, form, onChange }: TagInputsProps) {
  return <>
    {fields.map(field =>
      <TagInput key={ field } field={ field } value={ form[field] } onChange={ onChange } />
    )}
  </>
}

/** Artwork preview plus its replace/remove controls. */
type ArtworkFieldProps = {
  readonly art?:    string
  readonly color?:  string
  readonly album:   string
  readonly onPick:  (dataUrl: string) => void
  readonly onClear: () => void
}

function ArtworkField ({ art, color, album, onPick, onClear }: ArtworkFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file                = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file)
      return

    // Artwork is stored inline as a data URL, the same shape the scanner
    // produces from an embedded picture frame — so nothing downstream has to
    // care whether the image came from a tag or from this picker.
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string')
        onPick(reader.result)
    })
    reader.readAsDataURL(file)
  }

  return <div className='artwork-field'>
    <figure className='art-preview' style={{ backgroundColor: color }}>
      {art
        ? <img src={ art } alt={ `Album artwork for ${album}` } />
        : <Icon name='music' />
      }
    </figure>

    <menu className='artwork-actions'>
      <li>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={ () =>
            fileRef.current?.click() }>
          {art ? 'Replace' : 'Add artwork'}
        </Button>
      </li>

      <li>
        <Button type='button' variant='ghost' size='sm' disabled={ !art } onClick={ onClear }>
          Remove
        </Button>
      </li>
    </menu>

    <input
      ref={ fileRef }
      aria-label='Choose album artwork'
      type='file'
      accept='image/*'
      hidden
      onChange={ handleFile } />
  </div>
}

interface TagEditorFormProps {
  readonly track:   Track
  readonly onClose: () => void
  readonly onSaved: () => void
}

function TagEditorForm ({ track, onClose, onSaved }: TagEditorFormProps) {
  const data              = useData()
  const [ form, setForm ] = useState<FormState>(() =>
    readForm(track))
  // Artwork is not on the track — it is fetched per id. `artEdit` stays
  // `undefined` until the user actually touches it, which is what keeps a save
  // from rewriting (or worse, clearing) a cover nobody meant to change.
  const storedArt                     = useArtwork(track.id, 'full')
  const [ artEdit, setArtEdit ]       = useState<string | undefined>(undefined)
  const [ artCleared, setArtCleared ] = useState(false)
  const [ status, setStatus ]         = useState<string | null>(null)

  const art = artCleared ? undefined : artEdit ?? storedArt

  const setArt = (value: string | undefined) => {
    setArtCleared(value === undefined)
    setArtEdit(value)
  }

  const setField = (field: TagField, value: string) =>
    setForm(current =>
      ({ ...current, [field]: value }))

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Assigning through the model's setters is what marks it dirty and, in
    // turn, schedules the write — mutating a copy would update the screen and
    // persist nothing.
    const target = track as unknown as Record<string, unknown>
    for (const field of ALL_FIELDS)
      target[field] = parseField(field, form[field])

    // Untouched artwork is left off the write entirely rather than assigned
    // back — the model only sends columns it carries, so silence here means
    // "leave album_art alone" instead of "set it to whatever I happened to
    // have loaded".
    if (artCleared || artEdit !== undefined) {
      // Seed what the database currently holds before clearing, so removal
      // registers as a change: the setter ignores an assignment equal to the
      // value it already has, and a list-hydrated track has none.
      if (artCleared && storedArt !== undefined)
        target.albumArt = storedArt
      target.albumArt = artCleared ? undefined : artEdit
    }

    try {
      await data.upsertTrack(track.toDTO() as TrackDTO)
      setStatus('Saved')
      onSaved()
    }
    catch (error) {
      console.error('Failed to save tags:', error)
      setStatus('Could not save — see the console for details')
    }
  }

  return <article className='tag-editor-view'>
    <header className='tag-editor-header'>
      <h2>Edit Tags</h2>
      <Button type='button' variant='ghost' onClick={ onClose }>← Back</Button>
    </header>

    <form onSubmit={ handleSave }>
      <div className='editor-layout'>
        <ArtworkField
          art={ art }
          color={ track.coverColor }
          album={ track.album }
          onPick={ setArt }
          onClear={ () =>
            setArt(undefined) } />

        <section className='form-stack'>
          <TagInputs fields={ PRIMARY_TAG_FIELDS } form={ form } onChange={ setField } />

          <details className='tag-extended'>
            <summary>
              <Icon name='chevron-right' />
              More tags
            </summary>

            <fieldset className='form-stack'>
              <TagInputs fields={ EXTENDED_TAG_FIELDS } form={ form } onChange={ setField } />
            </fieldset>
          </details>

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

              <dd>
                <time dateTime={ isoDuration(track.duration) }>{formatTime(track.duration)}</time>
              </dd>
            </div>

            {track.bitrate !== undefined &&
                <div>
                  <dt>Bitrate</dt>

                  <dd>
                    {Math.round(track.bitrate / 1000)}
                    {' '}
                    kbps
                  </dd>
                </div>
            }

            {track.sampleRate !== undefined &&
                <div>
                  <dt>Sample rate</dt>

                  <dd>
                    {track.sampleRate}
                    {' '}
                    Hz
                  </dd>
                </div>
            }

            {track.channels !== undefined &&
                <div>
                  <dt>Channels</dt>
                  <dd>{track.channels}</dd>
                </div>
            }
          </dl>
        </section>
      </div>

      <footer className='footer-actions'>
        {status && <p className='status-note' role='status'>{status}</p>}
        <Button type='button' variant='ghost' onClick={ onClose }>Cancel</Button>
        <Button type='submit' variant='primary'>Save Changes</Button>
      </footer>
    </form>
  </article>
}

export function TagEditorView () {
  const { closeOverlay, editingTrackId } = useUI()
  const { registry, setTracks }          = useLibrary()
  const tracks                           = registry.getAllTracks()
  const track                            = tracks.find(candidate =>
    candidate.id === editingTrackId) || tracks[0]

  if (!track)
    return <article className='tag-editor-view empty-state'>
      <p>No track selected</p>
    </article>

  return <TagEditorForm
    key={ track.id }
    track={ track }
    onClose={ closeOverlay }
    onSaved={ () =>
    // The models were edited in place, so nothing downstream has changed
    // identity. Republishing them is what tells React to re-render the
    // library with the new titles.
      setTracks(registry.getAllTracks()) } />
}
