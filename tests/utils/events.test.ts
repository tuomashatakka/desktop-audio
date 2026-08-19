import { describe, expect, it, vi } from 'vitest'
import { afterPointerRelease } from '../../src/app/utils/events'


/**
 * These cover the *scheduling*, which is all jsdom can see. The behaviour the
 * helper exists for — a `popover=auto` surviving the right-click that opened
 * it — is light dismiss, which jsdom does not implement at all. Do not read a
 * green run here as "the context menus work"; that needs a real window.
 */
describe('afterPointerRelease', () => {
  it('shows immediately when no pointer button is down', () => {
    const show = vi.fn()

    afterPointerRelease(0, show)

    expect(show).toHaveBeenCalledTimes(1)
  })

  it('waits for the pointerup that ends a right-click', () => {
    const show = vi.fn()

    afterPointerRelease(2, show)
    expect(show).not.toHaveBeenCalled()

    window.dispatchEvent(new Event('pointerup'))
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('listens once, so a later click cannot reopen the menu', () => {
    const show = vi.fn()

    afterPointerRelease(2, show)
    window.dispatchEvent(new Event('pointerup'))
    window.dispatchEvent(new Event('pointerup'))

    expect(show).toHaveBeenCalledTimes(1)
  })
})
