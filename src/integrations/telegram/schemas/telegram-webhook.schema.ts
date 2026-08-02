import { z } from 'zod'

/**
 * Zod validation schema for parsing incoming Telegram Webhook Updates.
 */
export const telegramWebhookUpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      message_id: z.number().int(),
      from: z
        .object({
          id: z.number().int(),
          is_bot: z.boolean(),
          first_name: z.string(),
          last_name: z.string().optional(),
          username: z.string().optional(),
        })
        .optional(),
      chat: z.object({
        id: z.number().int(),
        type: z.enum(['private', 'group', 'supergroup', 'channel']),
        title: z.string().optional(),
        username: z.string().optional(),
      }),
      date: z.number().int(),
      text: z.string().optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: z.object({
        id: z.number().int(),
        first_name: z.string(),
        username: z.string().optional(),
      }),
      message: z.object({
        message_id: z.number().int(),
        chat: z.object({
          id: z.number().int(),
        }),
      }),
      data: z.string().optional(),
    })
    .optional(),
})

export type TelegramWebhookUpdate = z.infer<typeof telegramWebhookUpdateSchema>
