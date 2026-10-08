import { z } from 'zod'

// 32 random bytes as base64url = 43 characters.
export const studyPlanTokenParamsSchema = z.object({
  token: z
    .string()
    .length(43)
    .regex(/^[A-Za-z0-9_-]+$/),
})
