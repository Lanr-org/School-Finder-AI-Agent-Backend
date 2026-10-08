import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorContent, successEnvelope } from '../../docs/registry'

export const registerHealthDocs = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: '/health/live',
    tags: ['Health'],
    summary: 'Liveness probe',
    description:
      'Public. Returns 200 while the Node process is up and serving requests. Checks no dependencies, so a database outage never marks the process as dead.',
    responses: {
      200: {
        description: 'The process is live.',
        content: {
          'application/json': {
            schema: successEnvelope(z.object({ status: z.literal('ok') })),
          },
        },
      },
    },
  })

  registry.registerPath({
    method: 'get',
    path: '/health/ready',
    tags: ['Health'],
    summary: 'Readiness probe',
    description:
      'Public. Returns 200 when PostgreSQL answers a trivial query within 2 seconds, otherwise 503 with code SERVICE_UNAVAILABLE. Connection details are never exposed.',
    responses: {
      200: {
        description: 'The service can reach its database.',
        content: {
          'application/json': {
            schema: successEnvelope(
              z.object({
                status: z.literal('ready'),
                checks: z.object({ database: z.literal('up') }),
              }),
            ),
          },
        },
      },
      503: errorContent(
        'The database is unreachable or did not answer in time.',
      ),
    },
  })
}
