import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

export const registerTelegramDocs = (registry: OpenAPIRegistry) => {
  // This route answers Telegram, not the frontend, so it doesn't use the
  // standard success/error envelopes — documented as it actually responds.
  const ackSchema = z.object({
    ok: z.literal(true),
    ignored: z.boolean().optional(),
    reason: z.string().optional(),
  })
  const rejectionSchema = z.object({
    error: z.object({ code: z.string(), message: z.string() }),
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/webhooks/telegram',
    tags: ['Webhooks'],
    summary: 'Telegram bot webhook',
    description:
      'Public, called only by Telegram. Requests must carry the X-Telegram-Bot-Api-Secret-Token header matching the configured webhook secret. Valid updates are queued for background processing and acknowledged immediately. A malformed update is still answered 200 (with ignored: true) so Telegram does not keep retrying it.',
    request: {
      headers: z.object({
        'x-telegram-bot-api-secret-token': z.string().openapi({
          description:
            'Shared secret configured when the webhook was registered.',
        }),
      }),
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z
              .object({ update_id: z.number() })
              .passthrough()
              .openapi({ description: 'A Telegram Update object.' }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Update accepted (or ignored if malformed).',
        content: { 'application/json': { schema: ackSchema } },
      },
      403: {
        description: 'Missing or wrong secret token.',
        content: { 'application/json': { schema: rejectionSchema } },
      },
      500: {
        description: 'The webhook secret is not configured on the server.',
        content: { 'application/json': { schema: rejectionSchema } },
      },
    },
  })
}
