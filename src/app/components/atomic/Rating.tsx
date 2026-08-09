import { useId } from 'react'
import { Icon } from './Icon'


export const MAX_RATING = 5

/** `0` clears the rating; the schema stores it as an INTEGER 0–5. */
const STARS = Array.from({ length: MAX_RATING }, (_, i) =>
  i + 1)

interface RatingProps {
  readonly legend: string

  /** `0` or `undefined` both mean "unrated". */
  readonly value:     number | undefined
  readonly onChange?: (value: number) => void
  readonly readOnly?: boolean
}

/**
 * A five-star rating input.
 *
 * Same native pattern as {@link SegmentedControl}: a radio group, so arrow
 * keys, focus and the accessible name are the platform's job. The stars are
 * rendered in reverse DOM order and flipped back with `flex-direction:
 * row-reverse`, which is what lets `:checked ~ label` fill every star to the
 * *left* of the selected one with plain CSS and no per-star state.
 *
 * A sixth, first-in-DOM option clears the rating — without it a rating could
 * be set but never removed, since a radio group has no "uncheck" gesture.
 */
export function Rating ({ legend, value, onChange, readOnly = false }: RatingProps) {
  const name     = useId()
  const selected = value ?? 0

  return <fieldset className='rating' data-readonly={ readOnly || undefined }>
    <legend className='sr-only'>{legend}</legend>

    {[ ...STARS ].reverse().map(star =>
      <label key={ star } title={ `${star} star${star === 1 ? '' : 's'}` }>
        <input
          aria-label={ `${star} star${star === 1 ? '' : 's'}` }
          type='radio'
          name={ name }
          value={ star }
          checked={ selected === star }
          disabled={ readOnly }
          onChange={ () =>
            onChange?.(star) } />

        <Icon name='star' />
      </label>
    )}

    {!readOnly &&
      <button
        className='rating-clear'
        aria-label='Clear rating'
        type='button'
        title='Clear rating'
        onClick={ () =>
          onChange?.(0) }>
        <Icon name='close' />
      </button>
    }
  </fieldset>
}
