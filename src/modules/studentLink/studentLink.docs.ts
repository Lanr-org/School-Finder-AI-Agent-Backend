import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { errorContent, successEnvelope } from '../../docs/registry'

export const registerStudentLinkDocs = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/telegram-link',
    tags: ['Student portal'],
    security: [{ bearerAuth: [] }],
    summary: 'Create a link that connects Telegram to this account',
    description:
      "Student-facing API (the Smetase web app); requires a student access token. Returns a t.me deep link to the bot carrying a one-time token (15 minutes, single use; only its hash is stored). Opening it sends /start link_<token> to the bot, which attaches that Telegram account to the signed-in student, or merges the Telegram account's own student into it when that's safe. Limited to 10 per 15 minutes per student.",
    responses: {
      201: {
        description: 'Link created.',
        content: {
          'application/json': {
            schema: successEnvelope(
              z.object({
                url: z.string().url().openapi({ example: 'https://t.me/SmetaseBot?start=link_…' }),
                expiresAt: z.date(),
              }),
            ),
          },
        },
      },
      401: errorContent('Missing, invalid or expired student token.'),
      429: errorContent('Too many links requested (RATE_LIMITED).'),
      500: errorContent('TELEGRAM_BOT_USERNAME is not configured.'),
    },
  })
}
