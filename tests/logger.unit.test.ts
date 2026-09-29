import './setup-env'
import { describe, expect, it } from 'vitest'
import { sanitizeLoggedUrl } from '../src/config/logger'

describe('sanitizeLoggedUrl', () => {
  it('hides tokens in paths that carry one', () => {
    expect(
      sanitizeLoggedUrl('/api/v1/public/study-plans/Yv9VDChf2_abc-123'),
    ).toBe('/api/v1/public/study-plans/[REDACTED]')
    expect(sanitizeLoggedUrl('/api/v1/auth/invitations/abc123/accept')).toBe(
      '/api/v1/auth/invitations/[REDACTED]/accept',
    )
    expect(sanitizeLoggedUrl('/api/v1/auth/reset-password/abc123?x=1')).toBe(
      '/api/v1/auth/reset-password/[REDACTED]?x=1',
    )
  })

  it('leaves other URLs alone', () => {
    expect(sanitizeLoggedUrl('/api/v1/students/STU-1048/journey')).toBe(
      '/api/v1/students/STU-1048/journey',
    )
    expect(sanitizeLoggedUrl(undefined)).toBeUndefined()
  })
})
