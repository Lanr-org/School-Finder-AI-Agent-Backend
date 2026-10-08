// "Today" and "this week" for dashboard counts use the team's local time.
// Africa/Lagos is currently a fixed UTC+1 with no daylight saving; going
// through Intl keeps this correct even if that ever changes.
export const DASHBOARD_TIMEZONE = 'Africa/Lagos'

const DAY_MS = 24 * 60 * 60 * 1000

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

// Lagos wall-clock fields for `now`.
const lagosClock = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday'),
  }
}

/** UTC instant of 00:00 today in Lagos. */
export const lagosDayStart = (now: Date): Date => {
  const clock = lagosClock(now)
  // Lagos wall time read as if it were UTC, minus the real instant (to the
  // second) = the zone's current offset from UTC.
  const wallAsUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  )
  const offsetMs = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000
  return new Date(Date.UTC(clock.year, clock.month - 1, clock.day) - offsetMs)
}

/** UTC instant of 00:00 on this week's Monday in Lagos. */
export const lagosWeekStart = (now: Date): Date => {
  const daysSinceMonday = WEEKDAY_INDEX[lagosClock(now).weekday] ?? 0
  return new Date(lagosDayStart(now).getTime() - daysSinceMonday * DAY_MS)
}
