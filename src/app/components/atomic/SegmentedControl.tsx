import { useId } from 'react'
import { Icon } from './Icon'
import type { IconName } from '../../services/types'


export interface SegmentedOption<T extends string> {
  readonly value: T
  readonly label: string
  readonly icon?: IconName
}

interface SegmentedControlProps<T extends string> {
  readonly legend:   string
  readonly value:    T
  readonly options:  readonly SegmentedOption<T>[]
  readonly onChange: (value: T) => void

  /** Show only the icon, with the label carried by `title` and `aria-label`. */
  readonly iconOnly?:  boolean
  readonly className?: string
}

/**
 * A one-of-N switch — grouping mode, row density, anything with a small fixed
 * set of choices.
 *
 * It is a radio group because it *is* a radio group: `<fieldset>` + `<legend>`
 * names it, the radios carry selection, and roving focus with arrow keys comes
 * from the platform. No `role`, no `tabIndex`, no key handlers. The inputs are
 * visually hidden rather than `display: none`, so they stay focusable, and the
 * checked state is styled through `label:has(:checked)`.
 *
 * `name` is generated per instance: two segmented controls on one page must
 * not share a radio group, and callers shouldn't have to remember that.
 */
export function SegmentedControl<T extends string> ({
  legend, value, options, onChange, iconOnly = false, className = '',
}: SegmentedControlProps<T>) {
  const name = useId()

  return <fieldset className={ `segmented ${className}`.trim() } data-icon-only={ iconOnly || undefined }>
    <legend className='sr-only'>{legend}</legend>

    {options.map(option =>
      <label key={ option.value } title={ iconOnly ? option.label : undefined }>
        <input
          aria-label={ iconOnly ? option.label : undefined }
          type='radio'
          name={ name }
          value={ option.value }
          checked={ value === option.value }
          onChange={ () =>
            onChange(option.value) } />

        {option.icon && <Icon name={ option.icon } />}
        {!iconOnly && <span>{option.label}</span>}
      </label>
    )}
  </fieldset>
}
