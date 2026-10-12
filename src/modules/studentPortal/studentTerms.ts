import { createError } from '../../common/errors/AppError.js'
import type { MessageChannel } from '../../generated/prisma/index.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import StudentPortalRepo from './studentPortal.repository'

// The one-click agreement every student gives before Smetase uses their data: the Terms and
// Privacy Policy on smetase.com (which set the age rule: 16+, parent/guardian permission under 18).
// Change the version when those pages change materially, and everyone is asked again.
export const CURRENT_TERMS_VERSION = '2026-10-12'

export const TERMS_AGREEMENT_TEXT = 'I agree to the Terms and Privacy Policy.'

export const TERMS_URL = 'https://smetase.com/terms'
export const PRIVACY_URL = 'https://smetase.com/privacy'

export const hasAcceptedTerms = (student: { terms_version: string | null }) =>
  student.terms_version === CURRENT_TERMS_VERSION

export const StudentTermsService = {
  IsAccepted: async (studentId: string): Promise<boolean> => {
    const student = await StudentPortalRepo.findTermsAcceptance(studentId)
    return student ? hasAcceptedTerms(student) : false
  },

  // Idempotent: accepting the current version again changes nothing and writes no audit row.
  Accept: async (studentId: string, channel: MessageChannel): Promise<void> => {
    const student = await StudentPortalRepo.findTermsAcceptance(studentId)
    if (!student) throw createError('Student not found', 404, {}, 'NOT_FOUND')
    if (hasAcceptedTerms(student)) return

    await AuditService.withAudit(
      (tx) => StudentPortalRepo.acceptTerms(studentId, CURRENT_TERMS_VERSION, tx),
      (updated) => ({
        action: AUDIT_ACTIONS.STUDENT_TERMS_ACCEPTED,
        entityType: 'student',
        entityId: updated.public_id,
        // Students have no staff user id, so the actor stays null (system).
        actorId: null,
        actorRole: null,
        before: { termsVersion: student.terms_version },
        after: { termsVersion: updated.terms_version, termsAcceptedAt: updated.terms_accepted_at },
        metadata: { channel },
      }),
    )
  },
}
