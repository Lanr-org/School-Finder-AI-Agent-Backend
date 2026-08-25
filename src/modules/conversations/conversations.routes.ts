import express, { type Router } from 'express'
import { ConversationsController } from './conversations.controller.js'
import { ConversationsSchemas } from './conversations.schemas.js'
import { validate, validateParams, validateQuery } from '../../middleware/validate.js'
import { AuthenticateMiddleware } from '../../middleware/authenticate.js'
import { requireRole } from '../../middleware/authorize.js'

export const conversationsRouter: Router = express.Router()

// All conversations routes require authentication.
conversationsRouter.use(AuthenticateMiddleware)

// ADMIN manages every conversation; ADVISOR is scoped to conversations for students
// assigned to them (see ConversationsService / assertStudentOwnership). Operations does
// not manage conversations by default.
const canManageConversations = requireRole('ADMIN', 'ADVISOR')

conversationsRouter.get(
  '/',
  canManageConversations,
  validateQuery(ConversationsSchemas.listConversationsQuerySchema),
  ConversationsController.ListConversations,
)

conversationsRouter.get(
  '/:conversationId',
  canManageConversations,
  validateParams(ConversationsSchemas.conversationIdParamsSchema),
  ConversationsController.GetConversation,
)

conversationsRouter.post(
  '/:conversationId/replies',
  canManageConversations,
  validateParams(ConversationsSchemas.conversationIdParamsSchema),
  validate(ConversationsSchemas.createReplySchema),
  ConversationsController.Reply,
)

conversationsRouter.post(
  '/:conversationId/escalate',
  canManageConversations,
  validateParams(ConversationsSchemas.conversationIdParamsSchema),
  ConversationsController.Escalate,
)

conversationsRouter.post(
  '/:conversationId/resolve',
  canManageConversations,
  validateParams(ConversationsSchemas.conversationIdParamsSchema),
  ConversationsController.Resolve,
)

conversationsRouter.post(
  '/:conversationId/handback',
  canManageConversations,
  validateParams(ConversationsSchemas.conversationIdParamsSchema),
  ConversationsController.Handback,
)
