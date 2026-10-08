import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

// Must run before anything is registered. The old single openapi.ts only got
// this implicitly via import order (the *.schemas.ts files call it); calling it
// here removes that hidden dependency. Safe to call more than once.
extendZodWithOpenApi(z)

// One registry shared by every feature's docs file (src/modules/*/*.docs.ts).
// Features register into it via their registerXDocs function, called in a
// fixed order from src/docs/document.ts.
export const registry = new OpenAPIRegistry()

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

export const errorResponseSchema = registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    error: z.object({
      message: z.string(),
      code: z.string(),
      requestId: z.string(),
      details: z.unknown().optional(),
    }),
  }),
)

export const emptySuccessResponseSchema = registry.register(
  'EmptySuccessResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

export const errorContent = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
})

export const staffRefSchema = z.object({
  publicId: z.string(),
  fullName: z.string(),
})

export const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

export const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data,
    meta: z.object({ requestId: z.string() }),
  })

// Shared description for routes scoped by student ownership.
export const STUDENT_SCOPE_ROLE_NOTE =
  'Allowed roles: ADMIN (any student) and ADVISOR (assigned students only — enforced server-side; client-sent advisor IDs are never trusted).'
