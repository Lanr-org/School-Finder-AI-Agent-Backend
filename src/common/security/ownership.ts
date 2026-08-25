import { createError } from '../errors/AppError.js'
import type { AccessTokenClaims } from '../../modules/auth/auth.types.js'

// ADMIN can act on any student/conversation. ADVISOR is restricted to records
// assigned to them — never trust an advisorId sent by the client, always check
// against the authenticated user's own id from the JWT.
export const assertStudentOwnership = (assignedAdvisorId: string | null, auth: AccessTokenClaims): void => {
  if (auth.role === 'ADMIN') return
  if (auth.role === 'ADVISOR' && assignedAdvisorId === auth.sub) return

  throw createError('You do not have access to this student', 403, {}, 'FORBIDDEN')
}
