import { z } from 'zod'
import { STUDENT_REFRESH_COOKIE } from '../../http/cookie'

export const googleSignInSchema = z.object({
  credential: z.string().trim().min(1, 'Google credential is required').max(4096),
  // From the bot's /plan link: attach this Google account to that Telegram student.
  linkToken: z.string().trim().min(20).max(64).optional(),
})

// Read from the cookie by validateRefreshToken, which merges it into req.body.
export const studentRefreshCookieSchema = z.object({
  [STUDENT_REFRESH_COOKIE]: z.string().trim().length(128),
})
