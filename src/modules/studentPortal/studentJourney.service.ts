import { createError } from '../../common/errors/AppError'
import type { JourneyCheckKey } from '../../generated/prisma/index.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import { buildAdvisorLookup } from '../team/advisor-lookup.js'
import {
  deriveJourney,
  mostAdvancedOpenApplication,
  STUDENT_TICKABLE_CHECKS,
} from './studentJourney'
import StudentPortalRepo from './studentPortal.repository'
import type { Journey } from './studentPortal.types'

// Loads a student's journey (student web app, staff app and the AI prompt all use this)
// and ticks the steps the system can't detect. Callers check access first.

export type JourneyViewer =
  | { kind: 'STUDENT' }
  | { kind: 'STAFF'; userId: string }

const JourneyService = {
  // null if the student doesn't exist.
  ForStudent: async (
    studentId: string,
    viewer: JourneyViewer['kind'] = 'STUDENT',
  ): Promise<Journey | null> => {
    const student = await StudentPortalRepo.findStudent(studentId)
    if (!student) return null
    const [shortlistCount, statuses, checks, advisors] = await Promise.all([
      StudentPortalRepo.countShortlist(studentId),
      StudentPortalRepo.listApplicationStatuses(studentId),
      StudentPortalRepo.findJourneyChecks(studentId),
      buildAdvisorLookup([student.assigned_advisor_id]),
    ])
    return deriveJourney(
      {
        profile: {
          studyLevel: student.study_level,
          destinations: student.target_destinations,
          intakeSet: Boolean(
            student.target_intake_month && student.target_intake_year,
          ),
          budgetRange: student.budget_range,
          academicBackground: student.academic_background,
          englishTest: student.english_test_score,
        },
        shortlistCount,
        hasChoice: student.chosen_program_id !== null,
        studyPlanShared: student.study_plan_shared_at !== null,
        applicationStatus: mostAdvancedOpenApplication(statuses),
        advisorName: student.assigned_advisor_id
          ? (advisors.get(student.assigned_advisor_id)?.fullName ?? null)
          : null,
        checks: new Set(checks),
      },
      viewer,
    )
  },

  // Ticks (done = true) or unticks a step, audited, and returns the updated journey.
  SetCheck: async (
    student: { id: string; public_id: string },
    key: JourneyCheckKey,
    done: boolean,
    viewer: JourneyViewer,
  ): Promise<Journey> => {
    if (viewer.kind === 'STUDENT' && !STUDENT_TICKABLE_CHECKS.has(key)) {
      throw createError(
        'Your advisor updates this step',
        403,
        { key: ['Only staff can change this step'] },
        'FORBIDDEN',
      )
    }
    const doneBy = viewer.kind === 'STAFF' ? viewer.userId : null
    await AuditService.withAudit(
      async (tx) => {
        if (done)
          await StudentPortalRepo.setJourneyCheck(student.id, key, doneBy, tx)
        else await StudentPortalRepo.clearJourneyCheck(student.id, key, tx)
      },
      () => ({
        action: done
          ? AUDIT_ACTIONS.JOURNEY_CHECK_SET
          : AUDIT_ACTIONS.JOURNEY_CHECK_CLEARED,
        entityType: 'student',
        entityId: student.public_id,
        metadata: { key, by: viewer.kind },
        // A student has no staff actor; staff come from the request context.
        ...(viewer.kind === 'STUDENT' && { actorId: null, actorRole: null }),
      }),
    )
    const journey = await JourneyService.ForStudent(student.id, viewer.kind)
    if (!journey) throw createError('Student not found', 404, {}, 'NOT_FOUND')
    return journey
  },
}

export default JourneyService
