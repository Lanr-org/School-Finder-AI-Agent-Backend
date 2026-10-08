import { logger } from '../../config/logger.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import StudentLinkRepo from './studentLink.repository.js'
import { identitiesClash, pickSurvivor, type MergeSide } from './studentLink.rules.js'

export type MergeRefusal = 'BOTH_HAVE_STAFF_WORK' | 'IDENTITY_CLASH'
export type MergeResult = { outcome: 'MERGED'; survivorId: string } | { outcome: 'REFUSED'; reason: MergeRefusal }

// Refused merges are left for staff (no merge tool yet), so they're logged at warn level.
const refuse = (a: MergeSide, b: MergeSide, reason: MergeRefusal): MergeResult => {
  logger.warn({ students: [a.public_id, b.public_id], reason }, 'Student link needs a manual merge.')
  return { outcome: 'REFUSED', reason }
}

export const mergeStudents = async (aId: string, bId: string): Promise<MergeResult> => {
  const [a, b] = await Promise.all([StudentLinkRepo.loadForMerge(aId), StudentLinkRepo.loadForMerge(bId)])
  if (identitiesClash(a, b)) return refuse(a, b, 'IDENTITY_CLASH')
  const pair = pickSurvivor(a, b)
  if (!pair) return refuse(a, b, 'BOTH_HAVE_STAFF_WORK')

  const [survivor, absorbed] = pair
  await AuditService.withAudit(
    (tx) => StudentLinkRepo.absorb(survivor, absorbed, tx),
    () => ({
      action: AUDIT_ACTIONS.STUDENT_MERGED,
      entityType: 'student',
      entityId: survivor.public_id,
      metadata: { absorbed: absorbed.public_id },
      actorId: null, // system: the student linked their accounts
      actorRole: null,
    }),
  )
  logger.info({ survivor: survivor.public_id, absorbed: absorbed.public_id }, 'Merged duplicate students on link.')
  return { outcome: 'MERGED', survivorId: survivor.id }
}
