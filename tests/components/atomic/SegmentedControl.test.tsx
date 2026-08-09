import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '../../../src/app/components/atomic/SegmentedControl'
import type { SegmentedOption } from '../../../src/app/components/atomic/SegmentedControl'


type Mode = 'list' | 'grid'

const OPTIONS: readonly SegmentedOption<Mode>[] = [
  { value: 'list', label: 'List', icon: 'density-normal' },
  { value: 'grid', label: 'Grid', icon: 'grid-sm' },
]

describe('SegmentedControl', () => {
  it('is a real radio group, named by its legend', () => {
    render(
      <SegmentedControl legend='Layout' value='list' options={ OPTIONS } onChange={ vi.fn() } />
    )

    const group = screen.getByRole('group', { name: 'Layout' })
    expect(within(group).getByRole('radio', { name: 'List' })).toBeChecked()
    expect(within(group).getByRole('radio', { name: 'Grid' })).not.toBeChecked()
  })

  it('reports the selected value', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl legend='Layout' value='list' options={ OPTIONS } onChange={ onChange } />
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    expect(onChange).toHaveBeenCalledWith('grid')
  })

  it('keeps the label as the accessible name when only the icon shows', () => {
    render(
      <SegmentedControl legend='Layout' value='grid' options={ OPTIONS } iconOnly onChange={ vi.fn() } />
    )

    expect(screen.getByRole('radio', { name: 'Grid' })).toBeChecked()
    expect(screen.queryByText('Grid')).toBeNull()
  })

  it('generates its own radio name so two controls do not share a group', () => {
    render(
      <>
        <SegmentedControl legend='One' value='list' options={ OPTIONS } onChange={ vi.fn() } />
        <SegmentedControl legend='Two' value='grid' options={ OPTIONS } onChange={ vi.fn() } />
      </>
    )

    // Both stay checked; a shared `name` would have let the second unset the first.
    expect(within(screen.getByRole('group', { name: 'One' })).getByRole('radio', { name: 'List' })).toBeChecked()
    expect(within(screen.getByRole('group', { name: 'Two' })).getByRole('radio', { name: 'Grid' })).toBeChecked()
  })
})
