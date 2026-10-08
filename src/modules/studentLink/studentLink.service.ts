import crypto from 'node:crypto'
import env from '../../config/env.js'
import { createError } from '../../common/errors/AppError.js'
import { hashOpaqueToken } from '../../common/security/opaqueToken.js'
import { StudentIdentityProvider } from '../../generated/prisma/index.js'
import type { GoogleProfile } from '../../integrations/google/googleIdToken.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import { mergeStudents } from './studentLink.merge.js'
import StudentLinkRepo from './studentLink.repository.js'
import type { LinkResult } from './studentLink.types.js'

// Links a Telegram account and a Google account to one student, so someone who uses both the
// bot and the web app is one student with one conversation.

const newToken = () => crypto.randomBytes(32).toString('base64url') // 43 chars, fits Telegram's /start limit

// Attaches the account to the token's student; merges if the account already has its own student.
const link = async (
  token: string,
  provider: StudentIdentityProvider,
  subject: string,
  email: string | null,
): Promise<LinkResult> => {
  const targetId = await StudentLinkRepo.redeemToken(hashOpaqueToken(token), provider)
  if (!targetId) return { outcome: 'INVALID_TOKEN', studentId: null }

  const existing = await StudentLinkRepo.findIdentity(provider, subject)
  if (existing?.student_id === targetId) return { outcome: 'ALREADY_LINKED', studentId: targetId }

  if (existing) {
    const merged = await mergeStudents(existing.student_id, targetId)
    return merged.outcome === 'MERGED'
      ? { outcome: 'MERGED', studentId: merged.survivorId }
      : { outcome: 'REFUSED', studentId: existing.student_id }
  }

  // The target already has a *different* account of this kind (e.g. another Telegram).
  if (await StudentLinkRepo.findStudentIdentity(targetId, provider)) {
    return { outcome: 'REFUSED', studentId: targetId }
  }
  await AuditService.withAudit(
    (tx) => StudentLinkRepo.addIdentity(targetId, provider, subject, email, tx),
    (identity) => ({
      action: AUDIT_ACTIONS.STUDENT_IDENTITY_LINKED,
      entityType: 'student',
      entityId: identity.student.public_id,
      metadata: { provider },
      actorId: null, // system: the student linked their own account
      actorRole: null,
    }),
  )
  return { outcome: 'LINKED', studentId: targetId }
}

const StudentLinkService = {
  // Web → Telegram: a t.me deep link; Telegram then sends "/start link_<token>" to the bot.
  CreateTelegramLink: async (studentId: string) => {
    if (!env.telegramBotUsername) {
      throw createError('Telegram linking is not configured', 500, {}, 'INTERNAL_ERROR')
    }
    const token = newToken()
    const row = await StudentLinkRepo.createToken(
      studentId,
      hashOpaqueToken(token),
      StudentIdentityProvider.TELEGRAM,
    )
    return { url: `https://t.me/${env.telegramBotUsername}?start=link_${token}`, expiresAt: row.expires_at }
  },

  // Telegram → web: the bot's /plan link, redeemed by Google sign-in on the link page.
  CreateWebLink: async (studentId: string) => {
    const token = newToken()
    await StudentLinkRepo.createToken(studentId, hashOpaqueToken(token), StudentIdentityProvider.GOOGLE)
    return `${env.studentAppUrl}/link/${token}`
  },

  LinkTelegram: (token: string, telegramUserId: string) =>
    link(token, StudentIdentityProvider.TELEGRAM, telegramUserId, null),

  LinkGoogle: (token: string, profile: GoogleProfile) =>
    link(token, StudentIdentityProvider.GOOGLE, profile.subject, profile.email),
}

export default StudentLinkService
