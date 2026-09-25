import express, { type Router } from 'express'
import { StudentsController } from './students.controller.js'
import { StudentsSchemas } from './students.schemas.js'
import { NotesController } from './notes.controller.js'
import { NotesSchemas } from './notes.schemas.js'
import { FollowUpsController } from '../followUps/followUps.controller.js'
import { FollowUpsSchemas } from '../followUps/followUps.schemas.js'
import { RecommendationsController } from '../recommendations/recommendations.controller.js'
import { RecommendationsSchemas } from '../recommendations/recommendations.schemas.js'
import { ApplicationsController } from '../applications/applications.controller.js'
import { ApplicationsSchemas } from '../applications/applications.schemas.js'
import {
  validate,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const studentsRouter: Router = express.Router()

// All students routes require authentication — middleware applied first on every route.
studentsRouter.use(AuthenticateMiddleware)

// ADMIN sees/manages everyone; ADVISOR is scoped to their own assigned students at the
// service layer (see StudentsService.ListStudents / GetStudent / assertStudentOwnership).
const canAccessStudents = requireRole('ADMIN', 'ADVISOR')

// Only ADMIN assigns/reassigns advisors — advisors don't self-assign by default.
const canAssignAdvisor = requireRole('ADMIN')

studentsRouter.get(
  '/',
  canAccessStudents,
  validateQuery(StudentsSchemas.listStudentsQuerySchema),
  StudentsController.ListStudents,
)

studentsRouter.get(
  '/:studentId',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  StudentsController.GetStudent,
)

studentsRouter.patch(
  '/:studentId/advisor',
  canAssignAdvisor,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validate(StudentsSchemas.assignAdvisorSchema),
  StudentsController.AssignAdvisor,
)

studentsRouter.patch(
  '/:studentId/status',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validate(StudentsSchemas.updateStatusSchema),
  StudentsController.UpdateStatus,
)

studentsRouter.get(
  '/:studentId/status-history',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  StudentsController.GetStatusHistory,
)

// ── Notes ────────────────────────────────────────────────────────────────────
studentsRouter.get(
  '/:studentId/notes',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validateQuery(NotesSchemas.listNotesQuerySchema),
  NotesController.ListForStudent,
)

studentsRouter.post(
  '/:studentId/notes',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validate(NotesSchemas.createNoteSchema),
  NotesController.Create,
)

studentsRouter.patch(
  '/:studentId/notes/:noteId',
  canAccessStudents,
  validateParams(NotesSchemas.noteIdParamsSchema),
  validate(NotesSchemas.updateNoteSchema),
  NotesController.Update,
)

studentsRouter.delete(
  '/:studentId/notes/:noteId',
  canAccessStudents,
  validateParams(NotesSchemas.noteIdParamsSchema),
  NotesController.Delete,
)

// ── Follow-ups ───────────────────────────────────────────────────────────────
studentsRouter.get(
  '/:studentId/follow-ups',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validateQuery(FollowUpsSchemas.listFollowUpsQuerySchema),
  FollowUpsController.ListForStudent,
)

studentsRouter.post(
  '/:studentId/follow-ups',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validate(FollowUpsSchemas.createFollowUpSchema),
  FollowUpsController.Create,
)

studentsRouter.patch(
  '/:studentId/follow-ups/:followUpId',
  canAccessStudents,
  validateParams(FollowUpsSchemas.followUpIdParamsSchema),
  validate(FollowUpsSchemas.updateFollowUpSchema),
  FollowUpsController.Update,
)

studentsRouter.post(
  '/:studentId/follow-ups/:followUpId/complete',
  canAccessStudents,
  validateParams(FollowUpsSchemas.followUpIdParamsSchema),
  FollowUpsController.Complete,
)

studentsRouter.post(
  '/:studentId/follow-ups/:followUpId/cancel',
  canAccessStudents,
  validateParams(FollowUpsSchemas.followUpIdParamsSchema),
  FollowUpsController.Cancel,
)

// ── Applications ─────────────────────────────────────────────────────────────
studentsRouter.get(
  '/:studentId/applications',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validateQuery(ApplicationsSchemas.listStudentApplicationsQuerySchema),
  ApplicationsController.ListForStudent,
)

studentsRouter.post(
  '/:studentId/applications',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validate(ApplicationsSchemas.createApplicationSchema),
  ApplicationsController.Create,
)

// ── Recommendations ──────────────────────────────────────────────────────────
studentsRouter.post(
  '/:studentId/recommendation-runs',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validate(RecommendationsSchemas.generateRunSchema),
  RecommendationsController.GenerateRun,
)

studentsRouter.get(
  '/:studentId/recommendations',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  RecommendationsController.GetLatestForStudent,
)

studentsRouter.post(
  '/:studentId/shortlists',
  canAccessStudents,
  validateParams(StudentsSchemas.studentIdParamsSchema),
  validate(RecommendationsSchemas.createShortlistSchema),
  RecommendationsController.CreateShortlist,
)

studentsRouter.delete(
  '/:studentId/shortlists/:programId',
  canAccessStudents,
  validateParams(RecommendationsSchemas.studentProgramParamsSchema),
  RecommendationsController.DeleteShortlist,
)
