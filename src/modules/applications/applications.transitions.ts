import type { ApplicationStatus } from '../../generated/prisma/index.js'

// Happy-path order. Moving forward may skip steps; never backwards.
export const APPLICATION_FLOW: ApplicationStatus[] = [
  'DRAFT',
  'DOCUMENTS_PENDING',
  'SUBMITTED',
  'OFFER_RECEIVED',
  'VISA_PROCESSING',
  'COMPLETED',
]

export const TERMINAL_STATUSES: ApplicationStatus[] = [
  'COMPLETED',
  'REJECTED',
  'WITHDRAWN',
]

export const isTerminal = (status: ApplicationStatus): boolean =>
  TERMINAL_STATUSES.includes(status)

// REJECTED/WITHDRAWN are reachable from any open status (including DRAFT —
// a school can turn a student down at pre-screening, before formal submission).
export const canTransition = (
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean => {
  if (from === to || isTerminal(from)) return false
  if (to === 'REJECTED' || to === 'WITHDRAWN') return true
  return APPLICATION_FLOW.indexOf(to) > APPLICATION_FLOW.indexOf(from)
}

const ALL_STATUSES: ApplicationStatus[] = [
  ...APPLICATION_FLOW,
  'REJECTED',
  'WITHDRAWN',
]

// Returned in 409 details so the client can show what *is* allowed.
export const allowedNextStatuses = (
  from: ApplicationStatus,
): ApplicationStatus[] => ALL_STATUSES.filter((to) => canTransition(from, to))
