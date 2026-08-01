import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../../../src/app/components/atomic/Dialog'


describe('Dialog', () => {
  it('keeps a native dialog mounted and controls its open state', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog open={false} title='Create playlist' onClose={onClose}>
        <p>Dialog content</p>
      </Dialog>
    )

    const dialog = screen.getByText('Dialog content').closest('dialog')
    expect(dialog).not.toHaveAttribute('open')

    rerender(
      <Dialog open title='Create playlist' onClose={onClose}>
        <p>Dialog content</p>
      </Dialog>
    )

    expect(dialog).toHaveAttribute('open')
    expect(screen.getByRole('dialog', { name: 'Create playlist' })).toBe(dialog)
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('gives separate dialogs unique accessible title relationships', () => {
    render(
      <>
        <Dialog open title='First dialog' onClose={noop}><p>First</p></Dialog>
        <Dialog open title='Second dialog' onClose={noop}><p>Second</p></Dialog>
      </>
    )

    const first = screen.getByRole('dialog', { name: 'First dialog' })
    const second = screen.getByRole('dialog', { name: 'Second dialog' })
    expect(first.getAttribute('aria-labelledby')).not.toBe(second.getAttribute('aria-labelledby'))
  })
})

function noop () {}
