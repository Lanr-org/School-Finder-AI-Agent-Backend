import { logger } from '../../config/logger'
import { createError } from '../../common/errors/AppError'
import { AUTH_ERROR_CODES } from '../../common/errors/errorCodes'
import { createPublicStudentId, withUniquePublicId } from '../../common/security/publicId'
import { signStudentAccessToken } from '../../common/security/studentToken'
import { generateRefreshToken } from '../../common/security/token'
import { hashRefreshToken } from '../../common/security/tokenHash'
import { StudentIdentityProvider } from '../../generated/prisma/index.js'
import { verifyGoogleIdToken } from '../../integrations/google/googleIdToken'
import StudentAuthRepo from './studentAuth.repository'
import type { ClientInfo, GoogleSignInInput, StudentRefreshInput, StudentSummary } from './studentAuth.types'

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

type StudentWithProfile = NonNullable<Awaited<ReturnType<typeof StudentAuthRepo.findStudentById>>>

const toSummary = (student: StudentWithProfile): StudentSummary => ({
  publicId: student.public_id,
  firstName: student.contact.first_name,
  fullName: [student.contact.first_name, student.contact.last_name].filter(Boolean).join(' '),
  email: student.identities[0]?.email ?? student.contact.email,
})

const sessionEnded = () =>
  createError('Your session has ended, please sign in again', 401, {}, AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND)

const startSession = async (studentId: string, client: ClientInfo) => {
  const refreshToken = generateRefreshToken()
  const session = await StudentAuthRepo.createSession({
    studentId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    ipAddress: client.ipAddress,
    userAgent: client.userAgent,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  })
  return { accessToken: signStudentAccessToken(studentId, session.id), refreshToken }
}

const StudentAuthService = {
  SignInWithGoogle: async ({ credential, ...client }: GoogleSignInInput) => {
    const profile = await verifyGoogleIdToken(credential)
    const existing = await StudentAuthRepo.findIdentity(StudentIdentityProvider.GOOGLE, profile.subject)

    let student: StudentWithProfile
    let isNewStudent = false
    if (existing) {
      student = existing.student
      await StudentAuthRepo.touchIdentityLogin(existing.id)
    } else {
      student = await withUniquePublicId(createPublicStudentId, (publicId) =>
        StudentAuthRepo.registerGoogleStudent({ publicId, ...profile }),
      )
      isNewStudent = true
      logger.info({ studentId: student.public_id }, 'Registered new student via Google sign-in.')
    }

    const tokens = await startSession(student.id, client)
    return { ...tokens, student: toSummary(student), isNewStudent }
  },

  // Rotates the refresh token on every use. No IP/device check (unlike staff): students
  // are mostly on phones whose IP changes constantly.
  Refresh: async ({ refreshToken }: StudentRefreshInput) => {
    const session = await StudentAuthRepo.findSessionByTokenHash(hashRefreshToken(refreshToken))
    if (!session || session.revoked_at || session.expires_at <= new Date()) throw sessionEnded()

    const newRefreshToken = generateRefreshToken()
    await StudentAuthRepo.rotateSession(session.id, hashRefreshToken(newRefreshToken))
    return {
      accessToken: signStudentAccessToken(session.student_id, session.id),
      refreshToken: newRefreshToken,
      student: toSummary(session.student),
    }
  },

  // Cookie-based, so it works even after the access token has expired.
  Logout: async (refreshToken: string | undefined) => {
    if (refreshToken) await StudentAuthRepo.revokeSessionByTokenHash(hashRefreshToken(refreshToken))
  },

  Me: async (studentId: string) => {
    const student = await StudentAuthRepo.findStudentById(studentId)
    if (!student) throw sessionEnded()
    return toSummary(student)
  },
}

export default StudentAuthService
