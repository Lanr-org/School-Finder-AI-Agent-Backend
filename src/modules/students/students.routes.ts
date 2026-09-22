import express, { type Router } from 'express'
import { StudentsController } from './students.controller.js'
import { StudentsSchemas } from './students.schemas.js'
import { NotesController } from './notes.controller.js'
import { NotesSchemas } from './notes.schemas.js'
import { FollowUpsController } from '../followUps/followUps.controller.js'
import { FollowUpsSchemas } from '../followUps/followUps.schemas.js'
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
