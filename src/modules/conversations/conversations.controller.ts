import type { NextFunction, Request, Response } from 'express'
import { ConversationsService } from './conversations.service.js'
import { successResponse } from '../../http/response.js'
import type { AccessTokenClaims } from '../auth/auth.types.js'
import type { CreateReplyDTO, ListConversationsQueryDTO } from './conversations.types.js'

export class ConversationsController {
  // ── GET /conversations ──────────────────────────────────────────────────
  static ListConversations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await ConversationsService.ListConversations(
        req.query as unknown as ListConversationsQueryDTO,
        req.auth as AccessTokenClaims,
      )
      res.status(200).json(
        successResponse(true, 'Conversations retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── GET /conversations/:conversationId ──────────────────────────────────
  static GetConversation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversationId = req.params['conversationId'] as string
      const result = await ConversationsService.GetConversation(conversationId, req.auth as AccessTokenClaims)
      res.status(200).json(
        successResponse(true, 'Conversation retrieved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /conversations/:conversationId/replies ─────────────────────────
  static Reply = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversationId = req.params['conversationId'] as string
      const result = await ConversationsService.Reply(
        conversationId,
        req.body as CreateReplyDTO,
        req.auth as AccessTokenClaims,
      )
      res.status(201).json(
        successResponse(true, 'Reply sent successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /conversations/:conversationId/escalate ────────────────────────
  static Escalate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversationId = req.params['conversationId'] as string
      const result = await ConversationsService.Escalate(conversationId, req.auth as AccessTokenClaims)
      res.status(200).json(
        successResponse(true, 'Conversation escalated successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /conversations/:conversationId/resolve ─────────────────────────
  static Resolve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversationId = req.params['conversationId'] as string
      const result = await ConversationsService.Resolve(conversationId, req.auth as AccessTokenClaims)
      res.status(200).json(
        successResponse(true, 'Conversation marked resolved successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  // ── POST /conversations/:conversationId/handback ────────────────────────
  static Handback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conversationId = req.params['conversationId'] as string
      const result = await ConversationsService.Handback(conversationId, req.auth as AccessTokenClaims)
      res.status(200).json(
        successResponse(true, 'Conversation handed back to AI successfully', result, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }
}
