import express, { type Router } from 'express'
import { StudentsController } from './students.controller.js'
import { StudentsSchemas } from './students.schemas.js'
import { validate, validateParams, validateQuery } from '../../middleware/validate.js'
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
