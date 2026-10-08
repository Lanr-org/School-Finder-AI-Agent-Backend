import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { VisaRatesSchemas } from './visaRates.schemas'
import {
  emptySuccessResponseSchema,
  errorContent,
  paginationSchema,
  successEnvelope,
} from '../../docs/registry'

export const registerVisaRatesDocs = (registry: OpenAPIRegistry) => {
  // Mirrors toRateResponse (visaRates.service.ts).
  const rateSchema = z.object({
    publicId: z.string(),
    country: z.string(),
    sourcePartner: z.string().nullable(),
    periodLabel: z.string().openapi({ example: 'Q3 2026' }),
    successRate: z.number().openapi({ description: 'Percentage, 0–100.' }),
    sampleSize: z.number().nullable(),
    publishedAt: z.date(),
    isActive: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })

  const rateResponseSchema = registry.register(
    'VisaSuccessRateResponse',
    successEnvelope(rateSchema),
  )
  const rateListResponseSchema = registry.register(
    'VisaSuccessRateListResponse',
    successEnvelope(
      z.object({ rates: z.array(rateSchema), pagination: paginationSchema }),
    ),
  )

  const registeredRateIdParamsSchema = registry.register(
    'VisaSuccessRateIdParams',
    VisaRatesSchemas.rateIdParamsSchema,
  )
  const registeredListVisaRatesQuerySchema = registry.register(
    'ListVisaSuccessRatesQuery',
    VisaRatesSchemas.listVisaRatesQuerySchema,
  )
  const registeredCreateVisaRateSchema = registry.register(
    'CreateVisaSuccessRateRequest',
    VisaRatesSchemas.createVisaRateSchema,
  )
  const registeredUpdateVisaRateSchema = registry.register(
    'UpdateVisaSuccessRateRequest',
    VisaRatesSchemas.updateVisaRateSchema,
  )

  const unauthorized = errorContent('Bearer token is missing or invalid.')
  const forbidden = errorContent(
    'Only ADMIN and OPERATIONS may manage visa success rates.',
  )
  const MANAGE =
    'Requires a bearer access token. Allowed roles: ADMIN, OPERATIONS.'
  const AI_NOTE =
    'The latest active rate per country is injected into the Telegram AI’s grounding context, where it may be cited with its source.'

  registry.registerPath({
    method: 'get',
    path: '/api/v1/visa-success-rates',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'List visa success rates',
    description:
      'Requires a bearer access token. Any authenticated role may read. Optionally filtered by country.',
    request: { query: registeredListVisaRatesQuerySchema },
    responses: {
      200: {
        description: 'Visa success rates retrieved.',
        content: { 'application/json': { schema: rateListResponseSchema } },
      },
      400: errorContent('Query parameter validation failed.'),
      401: unauthorized,
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/visa-success-rates',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'Record a visa success rate',
    description: `${MANAGE} ${AI_NOTE}`,
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredCreateVisaRateSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Visa success rate created.',
        content: { 'application/json': { schema: rateResponseSchema } },
      },
      400: errorContent('Request validation failed (e.g. rate outside 0–100).'),
      401: unauthorized,
      403: forbidden,
    },
  })

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/visa-success-rates/{rateId}',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'Update or retract a visa success rate',
    description: `${MANAGE} isActive false retracts it without deleting. ${AI_NOTE}`,
    request: {
      params: registeredRateIdParamsSchema,
      body: {
        required: true,
        content: {
          'application/json': { schema: registeredUpdateVisaRateSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Visa success rate updated.',
        content: { 'application/json': { schema: rateResponseSchema } },
      },
      400: errorContent('Request validation failed.'),
      401: unauthorized,
      403: forbidden,
      404: errorContent('Visa success rate not found.'),
    },
  })

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/visa-success-rates/{rateId}',
    tags: ['Industry Intel'],
    security: [{ bearerAuth: [] }],
    summary: 'Delete a visa success rate',
    description: `${MANAGE} Permanent delete. Prefer isActive false to retract while keeping the record.`,
    request: { params: registeredRateIdParamsSchema },
    responses: {
      200: {
        description: 'Visa success rate deleted.',
        content: {
          'application/json': { schema: emptySuccessResponseSchema },
        },
      },
      400: errorContent('rateId path parameter is malformed.'),
      401: unauthorized,
      403: forbidden,
      404: errorContent('Visa success rate not found.'),
    },
  })
}
