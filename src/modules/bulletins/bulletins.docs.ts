import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { BulletinsSchemas } from './bulletins.schemas'
import {
  emptySuccessResponseSchema,
  errorContent,
  paginationSchema,
  successEnvelope,
} from '../../docs/registry'

export const registerBulletinsDocs = (registry: OpenAPIRegistry) => {
  // Mirrors toBulletinResponse (bulletins.service.ts).
  const bulletinSchema = z.object({
    publicId: z.string(),
    title: z.string(),
    body: z.string(),
    sourcePartner: z.string().nullable(),
    countries: z.array(z.string()).openapi({
      description: 'Normalized country names; empty means it applies globally.',
    }),
    publishedAt: z.date(),
    expiresAt: z.date().nullable(),
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })

  const bulletinResponseSchema = registry.register(
    'BulletinResponse',
    successEnvelope(bulletinSchema),
  )
  const bulletinListResponseSchema = registry.register(
    'BulletinListResponse',
    successEnvelope(
      z.object({
        bulletins: z.array(bulletinSchema),
        pagination: paginationSchema,
      }),
    ),
  )

  const registeredBulletinIdParamsSchema = registry.register(
    'BulletinIdParams',
    BulletinsSchemas.bulletinIdParamsSchema,
  )
  const registeredListBulletinsQuerySchema = registry.register(
    'ListBulletinsQuery',
    BulletinsSchemas.listBulletinsQuerySchema,
  )
  const registeredCreateBulletinSchema = registry.register(
    'CreateBulletinRequest',
    BulletinsSchemas.createBulletinSchema,
  )
  const registeredUpdateBulletinSchema = registry.register(
    'UpdateBulletinRequest',
    BulletinsSchemas.updateBulletinSchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbidden = errorContent(
    'Only ADMIN and OPERATIONS may manage bulletins.',
  )
  const MANAGE =
    'Requires a bearer access token. Allowed roles: ADMIN, OPERATIONS.'
  const AI_NOTE =
    'Active, unexpired bulletins are injected into the Telegram AI’s grounding context, so edits change what the bot may tell students.'

  registry.registerPath({
    method: 'get',
    path: '/api/v1/bulletins',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'List industry bulletins',
    description:
      'Requires a bearer access token. Any authenticated role may read. Optionally filtered by country.',
    request: { query: registeredListBulletinsQuerySchema },
    responses: {
      200: {
        description: 'Bulletins retrieved.',
        content: {
          'application/json': { schema: bulletinListResponseSchema },
        },
      },
      400: errorContent('Query parameter validation failed.'),
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/bulletins',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'Create a bulletin',
    description: `${MANAGE} ${AI_NOTE}`,
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateBulletinSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Bulletin created.',
        content: { 'application/json': { schema: bulletinResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbidden,
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/bulletins/{bulletinId}',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'Update or retract a bulletin',
    description: `${MANAGE} isActive false retracts it without deleting. ${AI_NOTE}`,
    request: {
      params: registeredBulletinIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateBulletinSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Bulletin updated.',
        content: { 'application/json': { schema: bulletinResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbidden,
      404: errorContent('Bulletin not found.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/bulletins/{bulletinId}',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'Delete a bulletin',
    description: `${MANAGE} Permanent delete. Prefer isActive false to retract while keeping the record.`,
    request: { params: registeredBulletinIdParamsSchema },
    responses: {
      200: {
        description: 'Bulletin deleted.',
        content: {
          'application/json': { schema: emptySuccessResponseSchema },
        },
      },
      400: errorContent('bulletinId path parameter is malformed.'),
      401: unauthorized,
      403: forbidden,
      404: errorContent('Bulletin not found.'),
    },
  })
}
