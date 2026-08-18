import { useCallback, useRef, useState } from 'react'


/** The modifier keys a click carried, as the platform reports them. */
export interface SelectionModifiers {

  /** Ctrl on Windows/Linux, Cmd on macOS — both mean "add to the selection". */
  readonly toggle: boolean
  readonly range:  boolean
}

export interface RowSelectionApi {
  readonly selected:   ReadonlySet<string>
  readonly isSelected: (id: string) => boolean

  /**
   * Apply a click on `id` within `order` — the ids as they are *rendered*,
   * which in a grouped table is not the sorted order.
   */
  readonly select:  (id: string, order: readonly string[], modifiers?: SelectionModifiers) => void
  readonly replace: (ids: readonly string[]) => void
  readonly clear:   () => void
}

const NO_MODIFIERS: SelectionModifiers = { toggle: false, range: false }

/**
 * List selection with the modifier conventions every file manager shares:
 * a plain click replaces, Ctrl/Cmd toggles one row, Shift takes the run from
 * the anchor to the row clicked.
 *
 * The anchor lives in a ref rather than in state because moving it never needs
 * to paint: it is read on the next click and nowhere else. Ctrl-clicking moves
 * the anchor to the row you touched, which is what makes Ctrl-click followed
 * by Shift-click extend from *there* rather than from wherever the selection
 * happened to start.
 */
export function useRowSelection (): RowSelectionApi {
  const [ selected, setSelected ] = useState<ReadonlySet<string>>(() =>
    new Set())
  const anchor = useRef<string | null>(null)

  const isSelected = useCallback((id: string) =>
    selected.has(id), [ selected ])

  const replace = useCallback((ids: readonly string[]) => {
    anchor.current = ids.at(-1) ?? null
    setSelected(new Set(ids))
  }, [])

  const clear = useCallback(() => {
    anchor.current = null
    setSelected(new Set())
  }, [])

  const select = useCallback((
    id: string,
    order: readonly string[],
    modifiers: SelectionModifiers = NO_MODIFIERS
  ) => {
    if (modifiers.range && anchor.current !== null) {
      const from = order.indexOf(anchor.current)
      const to   = order.indexOf(id)

      // An anchor that has since been filtered out of the list leaves nothing
      // to reach from, so the click falls back to selecting just this row.
      if (from >= 0 && to >= 0) {
        const [ start, end ] = from <= to ? [ from, to ] : [ to, from ]
        setSelected(new Set(order.slice(start, end + 1)))
        return
      }
    }

    if (modifiers.toggle) {
      anchor.current = id
      setSelected(current => {
        const next = new Set(current)
        if (!next.delete(id))
          next.add(id)
        return next
      })
      return
    }

    anchor.current = id
    setSelected(new Set([ id ]))
  }, [])

  return { selected, isSelected, select, replace, clear }
}
