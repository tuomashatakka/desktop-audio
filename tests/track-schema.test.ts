import { describe, expect, it, vi } from 'vitest'
import {
  ARTWORK_COLUMN,
  LIST_COLUMN_NAMES,
  MTIME_COLUMN,
  TRACK_COLUMN_NAMES,
  createTableSql,
  dtoColumns,
  dtoToParams,
  migrate,
  rowToDto,
  rowToListDto,
  upsertDtoSql,
  upsertSql,
} from '../src/track-schema'


describe('track schema', () => {
  it('keeps rating in fresh, scanner, and renderer write statements', () => {
    expect(TRACK_COLUMN_NAMES).toContain('rating')
    expect(createTableSql()).toContain('rating INTEGER')
    expect(upsertSql()).toContain('@rating')
    expect(upsertDtoSql()).toContain('@rating')
  })

  it('maps nullable database rows and renderer DTOs consistently', () => {
    expect(rowToDto({
      id:        'track-1',
      album_art: 'cover.jpg',
      rating:    4,
      year:      null,
    })).toMatchObject({
      id:       'track-1',
      albumArt: 'cover.jpg',
      rating:   4,
    })

    const params = dtoToParams({
      id:       'track-1',
      albumArt: 'cover.jpg',
      rating:   5,
    })
    expect(params.album_art).toBe('cover.jpg')
    expect(params.rating).toBe(5)
    expect(params.year).toBeNull()
  })

  it('migrates only columns missing from an existing library', () => {
    const statements: string[] = []
    const existing = [ ...TRACK_COLUMN_NAMES, MTIME_COLUMN ]
      .filter(name =>
        name !== 'rating')
      .map(name =>
        ({ name }))
    const db = {
      exec: vi.fn((sql: string) =>
        statements.push(sql)),
      prepare: vi.fn(() =>
        ({ all: () => existing })),
    }

    migrate(db)

    expect(db.prepare).toHaveBeenCalledWith('PRAGMA table_info(tracks)')
    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS tracks')
    expect(statements.slice(1)).toEqual([
      'ALTER TABLE tracks ADD COLUMN rating INTEGER',
    ])
  })
})

/*
 * These four guard one invariant between them: **a renderer write must never
 * touch a column it did not carry.** Track lists deliberately arrive without
 * `album_art`, so a writer that assumed every column was present would blank
 * the cover of every track the user ever edited — silently, and only visible
 * after a restart.
 */
describe('partial DTO writes', () => {
  it('leaves album art out of the list projection', () => {
    expect(LIST_COLUMN_NAMES).not.toContain(ARTWORK_COLUMN)
    expect(LIST_COLUMN_NAMES).toHaveLength(TRACK_COLUMN_NAMES.length - 1)

    const row = { id: 'a', title: 'T', album_art: 'data:image/png;base64,x' }

    expect(rowToListDto(row)).not.toHaveProperty('albumArt')
    expect(rowToDto(row)).toHaveProperty('albumArt')
  })

  it('counts only the columns a DTO actually carries', () => {
    expect(dtoColumns({ id: 'a', title: 'T' })).toEqual([ 'id', 'title' ])
  })

  it('treats an explicit undefined as a clear, and absence as silence', () => {
    // Present-but-undefined is how the tag editor empties a field.
    expect(dtoColumns({ id: 'a', genre: undefined })).toEqual([ 'id', 'genre' ])
    expect(dtoToParams({ id: 'a', genre: undefined }, [ 'id', 'genre' ]))
      .toEqual({ id: 'a', genre: null })

    // Absent entirely — the column must not appear in the statement at all.
    expect(dtoColumns({ id: 'a' })).toEqual([ 'id' ])
  })

  it('builds an upsert naming only the given columns', () => {
    const sql = upsertDtoSql([ 'id', 'title' ])

    expect(sql).toContain('INSERT INTO tracks (id, title)')
    expect(sql).toContain('title = excluded.title')
    expect(sql).not.toContain(ARTWORK_COLUMN)
    // `id` is the conflict target, never an assignment.
    expect(sql).not.toContain('id = excluded.id')
  })
})
