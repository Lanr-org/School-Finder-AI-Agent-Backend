import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import { emptySuccessResponseSchema, errorContent, successEnvelope } from '../../docs/registry'
import { googleSignInSchema } from './studentAuth.schemas'

const STUDENT_AUTH_NOTE =
  'Student-facing API (the Smetase web app). Separate from staff auth: student access tokens are signed with their own secret and audience, so they are rejected by every staff route, and staff tokens are rejected here.'

export const registerStudentAuthDocs = (registry: OpenAPIRegistry) => {
  const studentSummarySchema = registry.register(
    'StudentSummary',
    z.object({
      publicId: z.string(),
      firstName: z.string(),
      fullName: z.string(),
      email: z.string().email().nullable(),
    }),
  )

  const setCookieHeader = {
    'Set-Cookie': {
      schema: { type: 'string' as const },
      description:
        'HttpOnly smetase_student_rt refresh cookie, Path=/api/v1/student/auth, SameSite=Strict, Secure in production, 30 days.',
    },
  }

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/auth/google',
    tags: ['Student auth'],
    summary: 'Sign in a student with Google',
    description: `${STUDENT_AUTH_NOTE} Verifies the Google ID token (from Google's sign-in button) against our client ID and requires a verified email. A first-time Google account creates the student (a LIVE_CHAT contact, a NEW student with its status history, a first conversation and the Google identity) in one transaction. With a linkToken (from the bot's /plan link), the Google account is first attached to that Telegram student, or the two students are merged if the Google account already has one; sign-in then continues as the linked or surviving student, and linkOutcome says what happened. An invalid token or a refused merge never blocks sign-in. Rate limited to 20 requests per 15 minutes per IP.`,
    request: {
      body: { required: true, content: { 'application/json': { schema: googleSignInSchema } } },
    },
    responses: {
      200: {
        description: 'Signed in. The refresh token is set as a cookie.',
        headers: setCookieHeader,
        content: {
          'application/json': {
            schema: successEnvelope(
              z.object({
                accessToken: z.string(),
                student: studentSummarySchema,
                isNewStudent: z.boolean(),
                linkOutcome: z
                  .enum(['LINKED', 'ALREADY_LINKED', 'MERGED', 'REFUSED', 'INVALID_TOKEN'])
                  .optional()
                  .openapi({ description: 'Only when a linkToken was sent.' }),
              }),
            ),
          },
        },
      },
      400: errorContent('Missing or invalid credential.'),
      401: errorContent('Google token invalid (GOOGLE_TOKEN_INVALID) or email not verified (GOOGLE_EMAIL_NOT_VERIFIED).'),
      429: errorContent('Too many sign-in attempts (RATE_LIMITED).'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/auth/refresh',
    tags: ['Student auth'],
    summary: 'Refresh a student access token',
    description: `${STUDENT_AUTH_NOTE} Reads the smetase_student_rt cookie, checks the session is not revoked or expired, rotates the refresh token, and returns a new access token plus the student. A dead session also clears the cookie. Rate limited to 60 requests per 15 minutes per IP.`,
    responses: {
      200: {
        description: 'Session refreshed.',
        headers: setCookieHeader,
        content: {
          'application/json': {
            schema: successEnvelope(z.object({ accessToken: z.string(), student: studentSummarySchema })),
          },
        },
      },
      400: errorContent('Refresh cookie missing or malformed.'),
      401: errorContent('Session revoked, expired or not found (AUTH_SESSION_NOT_FOUND).'),
      429: errorContent('Too many refresh attempts (RATE_LIMITED).'),
    },
  })

  registry.registerPath({
    method: 'post',
    path: '/api/v1/student/auth/logout',
    tags: ['Student auth'],
    summary: 'Sign a student out',
    description: `${STUDENT_AUTH_NOTE} Revokes the session behind the smetase_student_rt cookie (if any) and clears the cookie. Works without an access token and is safe to call twice.`,
    responses: {
      200: {
        description: 'Signed out.',
        content: { 'application/json': { schema: emptySuccessResponseSchema } },
      },
    },
  })
}
