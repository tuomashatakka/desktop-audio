import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useColumnConfig, DEFAULT_COLUMNS } from '../../src/app/hooks/useColumnConfig'


const STORAGE_KEY = 'desktop-audio-column-config'

const keys = (columns: readonly { key: string }[]) =>
  columns.map(column =>
    column.key)

describe('useColumnConfig', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows only the visible columns, in order, as the grid template', () => {
    const { result } = renderHook(() =>
      useColumnConfig())

    expect(keys(result.current.visible)).toEqual(
      keys(DEFAULT_COLUMNS.filter(column =>
        column.visible)))
    expect(result.current.gridTemplate).toBe(
      DEFAULT_COLUMNS.filter(column =>
        column.visible).map(column =>
        column.width).join(' '))
  })

  it('toggles a column and persists the change as part of making it', () => {
    const { result } = renderHook(() =>
      useColumnConfig())

    act(() =>
      result.current.toggleColumn('year'))

    expect(keys(result.current.visible)).toContain('year')
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"year"')
  })

  it('refuses to hide a fixed column', () => {
    const { result } = renderHook(() =>
      useColumnConfig())

    act(() =>
      result.current.toggleColumn('title'))

    expect(keys(result.current.visible)).toContain('title')
  })

  it('restores the defaults on reset', () => {
    const { result } = renderHook(() =>
      useColumnConfig())

    act(() =>
      result.current.toggleColumn('artist'))
    expect(keys(result.current.visible)).not.toContain('artist')

    act(() =>
      result.current.resetColumns())
    expect(keys(result.current.visible)).toContain('artist')
  })

  it('reorders a column by moving it to another column\'s position', () => {
    const { result } = renderHook(() =>
      useColumnConfig())

    act(() =>
      result.current.reorderColumn('duration', 'artist'))

    const order = keys(result.current.columns)
    expect(order.indexOf('duration')).toBeLessThan(order.indexOf('artist'))
  })

  it('adds columns the stored config predates rather than dropping them', () => {
    // A config written before `rating` existed. Reconciling on load is what
    // keeps a new column from being invisible forever to anyone who ever
    // touched their layout.
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { key: 'title', label: 'stale', width: '1fr', visible: true },
      { key: 'artist', label: 'stale', width: '2fr', visible: false },
    ]))

    const { result } = renderHook(() =>
      useColumnConfig())

    expect(keys(result.current.columns)).toContain('rating')
    // Widths and visibility are the user's; labels and `fixed` are the code's.
    expect(result.current.columns.find(column =>
      column.key === 'artist')?.width).toBe('2fr')
    expect(result.current.columns.find(column =>
      column.key === 'title')?.label).toBe('Title')
    expect(result.current.columns.find(column =>
      column.key === 'title')?.fixed).toBe(true)
  })

  it('falls back to the defaults when the stored config is unreadable', () => {
    localStorage.setItem(STORAGE_KEY, 'not json')

    const { result } = renderHook(() =>
      useColumnConfig())

    expect(keys(result.current.columns)).toEqual(keys(DEFAULT_COLUMNS))
  })
})
