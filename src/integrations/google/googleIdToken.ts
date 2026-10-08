import { OAuth2Client } from 'google-auth-library'
import env from '../../config/env'
import { createError } from '../../common/errors/AppError'

// No client secret needed: we only verify the ID token Google signed for our client ID.
const client = new OAuth2Client()

export type GoogleProfile = {
  subject: string
  email: string
  givenName: string
  familyName: string | null
}

export const verifyGoogleIdToken = async (idToken: string): Promise<GoogleProfile> => {
  let payload
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.googleClientId })
    payload = ticket.getPayload()
  } catch {
    throw createError('Google sign-in could not be verified', 401, {}, 'GOOGLE_TOKEN_INVALID')
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw createError('Your Google account email is not verified', 401, {}, 'GOOGLE_EMAIL_NOT_VERIFIED')
  }

  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    givenName: payload.given_name ?? payload.name ?? 'Student',
    familyName: payload.family_name ?? null,
  }
}
