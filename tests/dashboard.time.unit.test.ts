import { describe, expect, it } from 'vitest'
import {
  lagosDayStart,
  lagosWeekStart,
} from '../src/modules/dashboard/dashboard.time'

// Africa/Lagos is UTC+1, so Lagos midnight is 23:00 UTC the previous day.
describe('Lagos day and week boundaries', () => {
  it('returns Lagos midnight for a mid-day instant', () => {
    expect(
      lagosDayStart(new Date('2026-09-24T12:00:00.000Z')).toISOString(),
    ).toBe('2026-09-23T23:00:00.000Z')
  })

  it('treats 23:30 UTC as the next Lagos day', () => {
    // 23:30 UTC on the 24th is 00:30 on the 25th in Lagos.
    expect(
      lagosDayStart(new Date('2026-09-24T23:30:00.000Z')).toISOString(),
    ).toBe('2026-09-24T23:00:00.000Z')
  })

  it('treats 22:59 UTC as still the same Lagos day', () => {
    expect(
      lagosDayStart(new Date('2026-09-24T22:59:59.000Z')).toISOString(),
    ).toBe('2026-09-23T23:00:00.000Z')
  })

  it('starts the week on Monday', () => {
    // Thursday 2026-09-24 → Monday 2026-09-21 00:00 Lagos.
    expect(
      lagosWeekStart(new Date('2026-09-24T12:00:00.000Z')).toISOString(),
    ).toBe('2026-09-20T23:00:00.000Z')
  })

  it('keeps a Monday morning in the new week', () => {
    // Monday 2026-09-21 00:30 Lagos.
    expect(
      lagosWeekStart(new Date('2026-09-20T23:30:00.000Z')).toISOString(),
    ).toBe('2026-09-20T23:00:00.000Z')
  })

  it('keeps late Sunday night in the week that started the previous Monday', () => {
    // Sunday 2026-09-27 23:30 Lagos (22:30 UTC) → week of Monday 2026-09-21.
    expect(
      lagosWeekStart(new Date('2026-09-27T22:30:00.000Z')).toISOString(),
    ).toBe('2026-09-20T23:00:00.000Z')
  })
})
