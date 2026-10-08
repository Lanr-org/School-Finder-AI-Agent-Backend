import crypto from 'node:crypto'
import env from '../../config/env.js'
import { createError } from '../../common/errors/AppError.js'
import { hashOpaqueToken } from '../../common/security/opaqueToken.js'
import StudentPortalRepo from '../studentPortal/studentPortal.repository'
import StudentPortalService from '../studentPortal/studentPortal.service'
import type {
  PublicStudyPlan,
  StudyPlanShareLink,
} from '../studentPortal/studentPortal.types'
import StudyPlanLinkRepo from './studyPlanLinks.repository'

// Read-only public links to a student's Study Plan, for parents and sponsors who don't sign in.
// The page is live: it always shows the student's current choice.

// Same message for unknown, expired and revoked links, and for a plan that no longer exists.
const notFound = () =>
  createError('This study plan link is not available', 404, {}, 'NOT_FOUND')

const StudyPlanLinkService = {
  Create: async (studentId: string): Promise<StudyPlanShareLink> => {
    const student = await StudentPortalRepo.findStudent(studentId)
    if (!student?.chosen_program_id) {
      throw createError(
        'Choose a programme before sharing your study plan',
        409,
        { _form: ['No programme chosen'] },
        'CONFLICT',
      )
    }
    const token = crypto.randomBytes(32).toString('base64url')
    const link = await StudyPlanLinkRepo.create(
      studentId,
      hashOpaqueToken(token),
    )
    // Creating a link is what counts as sharing (the "study plans shared" launch measure).
    await StudentPortalRepo.markStudyPlanShared(studentId)
    return {
      url: `${env.studentAppUrl}/p/${token}`,
      expiresAt: link.expires_at.toISOString(),
    }
  },

  RevokeAll: async (studentId: string) => {
    await StudyPlanLinkRepo.revokeAll(studentId)
  },

  GetPublic: async (token: string): Promise<PublicStudyPlan> => {
    const studentId = await StudyPlanLinkRepo.findLiveStudentId(
      hashOpaqueToken(token),
    )
    if (!studentId) throw notFound()
    const plan = await StudentPortalService.GetPublicStudyPlan(studentId)
    if (!plan) throw notFound()
    return plan
  },
}

export default StudyPlanLinkService
