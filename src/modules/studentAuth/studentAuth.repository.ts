import prisma from '../../database/prisma'
import {
  ContactProvider,
  ConversationMode,
  ConversationStatus,
  StudentIdentityProvider,
  StudentStatus,
} from '../../generated/prisma/index.js'
import { createPublicConversationId } from '../../common/security/publicId'

const studentWithProfile = { contact: true, identities: true } as const

export type RegisterGoogleStudentData = {
  publicId: string
  subject: string
  email: string
  givenName: string
  familyName: string | null
}

export type CreateStudentSessionData = {
  studentId: string
  refreshTokenHash: string
  ipAddress: string | null
  userAgent: string | null
  expiresAt: Date
}

const StudentAuthRepo = {
  findSessionById: (sessionId: string) =>
    prisma.studentSession.findUnique({ where: { id: sessionId } }),

  findIdentity: (provider: StudentIdentityProvider, subject: string) =>
    prisma.studentIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { student: { include: studentWithProfile } },
    }),

  touchIdentityLogin: (identityId: string) =>
    prisma.studentIdentity.update({
      where: { id: identityId },
      data: { last_login_at: new Date() },
    }),

  // Same shape as ContactsRepo.registerStudentWithContact (Telegram), plus the Google identity,
  // all in one transaction so a half-created student can't exist.
  registerGoogleStudent: (data: RegisterGoogleStudentData) =>
    prisma.$transaction(async (tx) => {
      const contact = await tx.contacts.create({
        data: {
          provider_type: ContactProvider.LIVE_CHAT,
          provider_user_id: data.subject,
          first_name: data.givenName,
          last_name: data.familyName,
          email: data.email,
        },
      })
      const student = await tx.student.create({
        data: { public_id: data.publicId, contact_id: contact.id, status: StudentStatus.NEW },
      })
      // Initial timeline entry — system-created lead, no staff user involved.
      await tx.studentStatusHistory.create({
        data: {
          student_id: student.id,
          from_status: null,
          to_status: StudentStatus.NEW,
          source: 'LEAD_CREATED',
          changed_by: null,
        },
      })
      await tx.conversations.create({
        data: {
          public_id: createPublicConversationId(),
          student_id: student.id,
          mode: ConversationMode.AI_BOT,
          status: ConversationStatus.ACTIVE,
        },
      })
      await tx.studentIdentity.create({
        data: {
          student_id: student.id,
          provider: StudentIdentityProvider.GOOGLE,
          subject: data.subject,
          email: data.email,
          last_login_at: new Date(),
        },
      })
      return tx.student.findUniqueOrThrow({ where: { id: student.id }, include: studentWithProfile })
    }),

  createSession: (data: CreateStudentSessionData) =>
    prisma.studentSession.create({
      data: {
        student_id: data.studentId,
        refresh_token_hash: data.refreshTokenHash,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
        expires_at: data.expiresAt,
      },
    }),

  findSessionByTokenHash: (refreshTokenHash: string) =>
    prisma.studentSession.findUnique({
      where: { refresh_token_hash: refreshTokenHash },
      include: { student: { include: studentWithProfile } },
    }),

  rotateSession: (sessionId: string, refreshTokenHash: string) =>
    prisma.studentSession.update({
      where: { id: sessionId },
      data: { refresh_token_hash: refreshTokenHash, last_used_at: new Date() },
    }),

  // updateMany so logging out twice is harmless.
  revokeSessionByTokenHash: (refreshTokenHash: string) =>
    prisma.studentSession.updateMany({
      where: { refresh_token_hash: refreshTokenHash, revoked_at: null },
      data: { revoked_at: new Date() },
    }),

  findStudentById: (studentId: string) =>
    prisma.student.findUnique({ where: { id: studentId }, include: studentWithProfile }),
}

export default StudentAuthRepo
