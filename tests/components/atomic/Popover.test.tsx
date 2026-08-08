import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Popover } from '../../../src/app/components/atomic/Popover'


function Harness () {
  const [ open, setOpen ] = useState(false)
  const [ anchor, setAnchor ] = useState<HTMLButtonElement | null>(null)

  return (
    <>
      <button ref={setAnchor} type='button' onClick={() => setOpen(value => !value)}>Options</button>
      <Popover open={open} anchor={anchor} onClose={() => setOpen(false)}>
        <button type='button'>One action</button>
      </Popover>
    </>
  )
}

describe('Popover', () => {
  it('keeps native popover content mounted and anchors it with css', () => {
    render(<Harness />)

    const anchor = screen.getByRole('button', { name: 'Options' })
    const panel = screen.getByText('One action').closest('[popover]')
    expect(panel).toHaveAttribute('popover', 'auto')

    fireEvent.click(anchor)

    expect(screen.getByText('One action').closest('[popover]')).toBe(panel)
    expect(anchor.style.getPropertyValue('anchor-name')).toMatch(/^--popover-/)
    expect((panel as HTMLElement).style.getPropertyValue('position-anchor')).toBe(
      anchor.style.getPropertyValue('anchor-name')
    )
  })
})
