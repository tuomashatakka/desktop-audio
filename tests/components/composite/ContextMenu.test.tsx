import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MenuList } from '../../../src/app/components/composite/ContextMenu'


describe('MenuList', () => {
  it('keeps native buttons, svg icons, and source indexes around separators', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <MenuList
        items={[
          { label: 'Settings', icon: 'settings' },
          { separator: true },
          { label: 'Remove', icon: 'close', danger: true },
        ]}
        onSelect={onSelect}
      />
    )

    const settings = screen.getByRole('button', { name: 'Settings' })
    const remove = screen.getByRole('button', { name: 'Remove' })
    expect(settings.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(remove).toHaveClass('danger')
    expect(container.querySelector('.context-menu-separator')).toBeInTheDocument()

    fireEvent.click(remove)

    expect(onSelect).toHaveBeenCalledWith(2)
  })
})
