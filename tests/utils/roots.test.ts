import { describe, expect, it } from 'vitest'
import { isUnderRoot, isUnderRoots, removedRoots } from '../../src/app/utils/roots'
import { rootScopeClause } from '../../src/track-schema'


/**
 * These two decide what a removed library folder takes with it — the renderer
 * predicate and the SQL that has to agree with it. Both are pure, and both are
 * places where being wrong means deleting the wrong rows.
 */
describe('isUnderRoot', () => {
  it('claims the root itself and everything beneath it', () => {
    expect(isUnderRoot('/music', '/music')).toBe(true)
    expect(isUnderRoot('/music/a/b.mp3', '/music')).toBe(true)
  })

  it('does not claim a sibling that merely shares the prefix', () => {
    // The separator is the whole point: without it '/music/live' would also
    // swallow '/music/live sets'.
    expect(isUnderRoot('/music-old/a.mp3', '/music')).toBe(false)
    expect(isUnderRoot('/music/live sets/a.mp3', '/music/live')).toBe(false)
  })

  it('is vacuously false across no roots', () => {
    expect(isUnderRoots('/music/a.mp3', [])).toBe(false)
  })

  it('matches across several roots', () => {
    expect(isUnderRoots('/b/x.mp3', [ '/a', '/b' ])).toBe(true)
    expect(isUnderRoots('/c/x.mp3', [ '/a', '/b' ])).toBe(false)
  })
})

describe('removedRoots', () => {
  it('reports nothing when nothing was known yet', () => {
    // The first run. Settings hydrate asynchronously, so "the list changed
    // from the defaults" must never read as "the user deleted every folder".
    expect(removedRoots(null, [])).toEqual([])
    expect(removedRoots(null, [ '/music' ])).toEqual([])
  })

  it('reports the roots that went away', () => {
    expect(removedRoots([ '/a', '/b' ], [ '/a' ])).toEqual([ '/b' ])
    expect(removedRoots([ '/a' ], [])).toEqual([ '/a' ])
  })

  it('reports nothing for an addition', () => {
    expect(removedRoots([ '/a' ], [ '/a', '/b' ])).toEqual([])
  })
})

describe('rootScopeClause', () => {
  it('matches the root and its descendants, with interleaved params', () => {
    const scope = rootScopeClause([ '/music' ])

    expect(scope.sql).toBe('(path = ? OR path LIKE ? || \'/%\')')
    expect(scope.params).toEqual([ '/music', '/music' ])
  })

  it('ORs several roots together', () => {
    const scope = rootScopeClause([ '/a', '/b' ])

    expect(scope.sql.match(/OR path LIKE/g)).toHaveLength(2)
    expect(scope.params).toEqual([ '/a', '/a', '/b', '/b' ])
  })

  it('matches nothing at all when given no roots', () => {
    // Not an empty string: this is interpolated straight into
    // `DELETE FROM tracks WHERE …`, where vanishing would delete the library.
    expect(rootScopeClause([]).sql).toBe('0')
    expect(rootScopeClause([]).params).toEqual([])
  })
})
