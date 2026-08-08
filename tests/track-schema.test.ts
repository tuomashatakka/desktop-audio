import { describe, expect, it, vi } from 'vitest'
import {
  MTIME_COLUMN,
  TRACK_COLUMN_NAMES,
  createTableSql,
  dtoToParams,
  migrate,
  rowToDto,
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
