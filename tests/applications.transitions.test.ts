import { describe, expect, it } from 'vitest'
import {
  allowedNextStatuses,
  canTransition,
  isTerminal,
} from '../src/modules/applications/applications.transitions'

describe('application status transitions', () => {
  it('allows moving forward one step', () => {
    expect(canTransition('DRAFT', 'DOCUMENTS_PENDING')).toBe(true)
    expect(canTransition('SUBMITTED', 'OFFER_RECEIVED')).toBe(true)
    expect(canTransition('VISA_PROCESSING', 'COMPLETED')).toBe(true)
  })

  it('allows skipping forward', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true)
    expect(canTransition('DOCUMENTS_PENDING', 'VISA_PROCESSING')).toBe(true)
  })

  it('never allows moving backwards', () => {
    expect(canTransition('SUBMITTED', 'DRAFT')).toBe(false)
    expect(canTransition('OFFER_RECEIVED', 'DOCUMENTS_PENDING')).toBe(false)
    expect(canTransition('VISA_PROCESSING', 'SUBMITTED')).toBe(false)
  })

  it('rejects a same-status "transition"', () => {
    expect(canTransition('SUBMITTED', 'SUBMITTED')).toBe(false)
  })

  it.each([
    'DRAFT',
    'DOCUMENTS_PENDING',
    'SUBMITTED',
    'OFFER_RECEIVED',
    'VISA_PROCESSING',
  ] as const)('allows REJECTED and WITHDRAWN from open status %s', (from) => {
    expect(canTransition(from, 'REJECTED')).toBe(true)
    expect(canTransition(from, 'WITHDRAWN')).toBe(true)
  })

  it.each(['COMPLETED', 'REJECTED', 'WITHDRAWN'] as const)(
    'treats %s as final — nothing can follow it',
    (from) => {
      expect(isTerminal(from)).toBe(true)
      expect(allowedNextStatuses(from)).toEqual([])
    },
  )

  it('lists every allowed next status for an open application', () => {
    expect(allowedNextStatuses('OFFER_RECEIVED')).toEqual([
      'VISA_PROCESSING',
      'COMPLETED',
      'REJECTED',
      'WITHDRAWN',
    ])
  })
})
