import { describe, expect, it } from 'vitest'
import { formatTime, isoDuration } from '../../src/app/utils/time'


describe('playback time formatting', () => {
  it.each([
    [ 0, '0:00', 'PT0S' ],
    [ 65, '1:05', 'PT1M5S' ],
    [ 225.9, '3:45', 'PT3M45S' ],
    [ Number.NaN, '0:00', 'PT0S' ],
  ])('formats %s seconds', (seconds, visible, machineReadable) => {
    expect(formatTime(seconds)).toBe(visible)
    expect(isoDuration(seconds)).toBe(machineReadable)
  })
})
