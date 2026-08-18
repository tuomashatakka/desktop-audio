import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRowSelection } from '../../src/app/hooks/useRowSelection'


const order = [ 'a', 'b', 'c', 'd' ]

const selected = (set: ReadonlySet<string>) =>
  [ ...set ].sort()

describe('useRowSelection', () => {
  it('replaces the selection on a plain click', () => {
    const { result } = renderHook(() =>
      useRowSelection())

    act(() =>
      result.current.select('a', order))
    act(() =>
      result.current.select('c', order))

    expect(selected(result.current.selected)).toEqual([ 'c' ])
  })

  it('adds and removes one row with the toggle modifier', () => {
    const { result } = renderHook(() =>
      useRowSelection())

    act(() =>
      result.current.select('a', order))
    act(() =>
      result.current.select('c', order, { toggle: true, range: false }))
    expect(selected(result.current.selected)).toEqual([ 'a', 'c' ])

    act(() =>
      result.current.select('a', order, { toggle: true, range: false }))
    expect(selected(result.current.selected)).toEqual([ 'c' ])
  })

  it('takes the run from the anchor with the range modifier', () => {
    const { result } = renderHook(() =>
      useRowSelection())

    act(() =>
      result.current.select('b', order))
    act(() =>
      result.current.select('d', order, { toggle: false, range: true }))

    expect(selected(result.current.selected)).toEqual([ 'b', 'c', 'd' ])
  })

  it('takes the same run when the range runs backwards', () => {
    const { result } = renderHook(() =>
      useRowSelection())

    act(() =>
      result.current.select('d', order))
    act(() =>
      result.current.select('b', order, { toggle: false, range: true }))

    expect(selected(result.current.selected)).toEqual([ 'b', 'c', 'd' ])
  })

  it('extends from the row a toggle-click last touched', () => {
    const { result } = renderHook(() =>
      useRowSelection())

    act(() =>
      result.current.select('a', order))
    act(() =>
      result.current.select('c', order, { toggle: true, range: false }))
    act(() =>
      result.current.select('d', order, { toggle: false, range: true }))

    // The anchor moved to 'c', so the run is c–d rather than a–d.
    expect(selected(result.current.selected)).toEqual([ 'c', 'd' ])
  })

  it('falls back to a single row when the anchor has been filtered away', () => {
    const { result } = renderHook(() =>
      useRowSelection())

    act(() =>
      result.current.select('a', order))
    act(() =>
      result.current.select('c', [ 'c', 'd' ], { toggle: false, range: true }))

    expect(selected(result.current.selected)).toEqual([ 'c' ])
  })

  it('clears', () => {
    const { result } = renderHook(() =>
      useRowSelection())

    act(() =>
      result.current.replace([ 'a', 'b' ]))
    expect(result.current.isSelected('b')).toBe(true)

    act(() =>
      result.current.clear())
    expect(selected(result.current.selected)).toEqual([])
  })
})
