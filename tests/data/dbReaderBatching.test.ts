/**
 * The hydrate stream's chunking, tested against the real `batchRows` generator
 * the worker drives. A regression here — an unflushed tail, a dropped row at a
 * batch boundary, an eagerly-drained cursor — surfaces in the app as a library
 * that renders partially, so it is worth pinning down directly.
 */
import { describe, it, expect } from 'vitest'
import { batchRows } from '../../src/db-reader'


const BATCH_SIZE = 4

/** `batchRows` maps rows through `rowToDto`, so these carry real column names. */
const rowsOfLength = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    ({ id: `track-${i}`, title: `Song ${i}`, album_art: null }))

const batchesOf = (rows: readonly Record<string, unknown>[]) =>
  [ ...batchRows(rows, BATCH_SIZE) ]

describe('batchRows', () => {
  it('yields nothing for an empty table', () => {
    expect(batchesOf([])).toEqual([])
  })

  it('yields one short batch when the table is smaller than a batch', () => {
    const batches = batchesOf(rowsOfLength(3))

    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(3)
  })

  it('splits an exact multiple into full batches with no empty tail', () => {
    const batches = batchesOf(rowsOfLength(BATCH_SIZE * 3))

    expect(batches).toHaveLength(3)
    expect(batches.every(batch =>
      batch.length === BATCH_SIZE)).toBe(true)
  })

  it('yields the remainder after the last full batch', () => {
    const batches = batchesOf(rowsOfLength(BATCH_SIZE * 2 + 1))

    expect(batches).toHaveLength(3)
    expect(batches.at(-1)).toHaveLength(1)
  })

  it('preserves row order across batch boundaries', () => {
    const rows = rowsOfLength(BATCH_SIZE + 3)

    expect(batchesOf(rows).flat().map(row =>
      row.id)).toEqual(rows.map(row =>
      row.id))
  })

  it('maps rows to camelCase DTOs and drops null columns', () => {
    const batches = batchesOf([
      { id: 'a', title: 'T', album_art: 'data:image/png;base64,x', genre: null },
    ])

    expect(batches[0][0]).toEqual({ id: 'a', title: 'T', albumArt: 'data:image/png;base64,x' })
  })

  /*
   * The whole point of the generator: better-sqlite3's `iterate()` is lazy,
   * and a callback-based collector would drain it into memory before the
   * renderer saw anything. Pulling one batch must consume exactly one batch
   * worth of rows.
   */
  it('consumes the cursor lazily, one batch at a time', () => {
    let produced = 0

    function* cursor () {
      for (let i = 0; i < BATCH_SIZE * 3; i++) {
        produced++
        yield { id: `track-${i}` }
      }
    }

    const batches = batchRows(cursor(), BATCH_SIZE)

    expect(produced).toBe(0)

    batches.next()
    expect(produced).toBe(BATCH_SIZE)

    batches.next()
    expect(produced).toBe(BATCH_SIZE * 2)
  })
})
