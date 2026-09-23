import { createError } from '../errors/AppError.js'
import type { AccessTokenClaims } from '../../modules/auth/auth.types.js'

// ADMIN can act on any student/conversation. ADVISOR is restricted to records
// assigned to them — never trust an advisorId sent by the client, always check
// against the authenticated user's own id from the JWT.
export const assertStudentOwnership = (
  assignedAdvisorId: string | null,
  auth: AccessTokenClaims,
): void => {
  if (auth.role === 'ADMIN') return
  if (auth.role === 'ADVISOR' && assignedAdvisorId === auth.sub) return

  throw createError(
    'You do not have access to this student',
    403,
    {},
    'FORBIDDEN',
  )
}

// Same shape as assertStudentOwnership: ADMIN can manage any advisor's profile;
// an ADVISOR may only act on their own profile (profileUserId is the Users.id
// the profile belongs to, never trust a client-supplied advisorId otherwise).
export const assertAdvisorOwnership = (
  profileUserId: string,
  auth: AccessTokenClaims,
): void => {
  if (auth.role === 'ADMIN') return
  if (auth.role === 'ADVISOR' && profileUserId === auth.sub) return

  throw createError(
    'You do not have access to this advisor profile',
    403,
    {},
    'FORBIDDEN',
  )
}
