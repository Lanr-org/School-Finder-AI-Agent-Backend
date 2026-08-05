import { createError } from '../../common/errors/AppError'
import prisma from '../../database/prisma'
import type {
  AuthSessionDbData,
  ChangePasswordTransactionData,
  EditUserDetailsT,
  PasswordResetTokenDbData,
  ResetPasswordTransactionData,
  RotateRefreshTokenData,
  UpdateInvitationAndUserPasswordData,
} from './auth.types'

class AuthRepo {
  static async findUser(where: { email?: string; id?: string }) {
    const user = await prisma.users.findFirst({
      where,
    })

    return user
  }

  static async createAuthSession(data: AuthSessionDbData) {
    try {
      const authSession = await prisma.auth_Sessions.create({
        data: {
          user_id: data.user_id,
          refresh_token_hash: data.refreshTokenHash,
          token_family: data.tokenFamily,
          user_agent: data.userAgent,
          ip_address: data.ipAddress,
          expires_at: data.expiresAt,
          revoked_at: null,
          last_used_at: null,
        },
        select: { id: true, expires_at: true },
      })

      return authSession
    } catch (err) {
      throw createError(
        'Failed to create auth session',
        500,
        { stack: err instanceof Error ? err.stack : undefined },
        'DATABASE_ERROR',
      )
    }
  }

  static async updateLastLogin(userId: string) {
    await prisma.users.update({
      where: { id: userId },
      data: { last_login_at: new Date() },
    })
  }
  static async findAuthSession(hashedRefreshToken: string) {
    const authSession = await prisma.auth_Sessions.findUnique({
      where: { refresh_token_hash: hashedRefreshToken },
    })

    return authSession
  }

  static async findAuthSessionById(sessionId: string) {
    return prisma.auth_Sessions.findUnique({
      where: { id: sessionId },
    })
  }

  static async rotateRefreshToken(data: RotateRefreshTokenData) {
    return prisma.auth_Sessions.update({
      where: { id: data.authSessionId },
      data: {
        refresh_token_hash: data.hashedRefreshToken,
        last_used_at: data.lastUsedAt,
      },
    })
  }

  static async revokeAuthSession(sessionId: string) {
    await prisma.auth_Sessions.update({
      where: {
        id: sessionId,
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    })
  }

  static async revokeAuthSessionFamily(userId: string) {
    await prisma.auth_Sessions.updateMany({
      where: {
        user_id: userId,
        revoked_at: null,
      },
      data: { revoked_at: new Date() },
    })
  }

  static async updateUserDetails(userId: string, data: EditUserDetailsT) {
    return prisma.users.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined && { full_name: data.fullName }),
        ...(data.phone !== undefined && { phone: data.phone }),
      },
    })
  }

  static async changePasswordAndRotateSessions(
    data: ChangePasswordTransactionData,
  ) {
    return prisma.$transaction(async (tx) => {
      const updatedUser = await tx.users.update({
        where: { id: data.userId },
        data: {
          password_hash: data.newPasswordHash,
          token_version: data.currentTokenVersion + 1,
          password_changed_at: data.changedAt,
        },
      })

      await tx.auth_Sessions.updateMany({
        where: {
          user_id: data.userId,
          revoked_at: null,
          id: {
            not: data.currentSessionId,
          },
        },
        data: {
          revoked_at: data.changedAt,
        },
      })

      await tx.auth_Sessions.update({
        where: { id: data.currentSessionId },
        data: {
          refresh_token_hash: data.newRefreshTokenHash,
          last_used_at: data.changedAt,
        },
      })

      return updatedUser
    })
  }

  static async createPasswordResetToken(data: PasswordResetTokenDbData) {
    return prisma.$transaction(async (tx) => {
      await tx.password_Reset_Tokens.updateMany({
        where: {
          user_id: data.userId,
          used_at: null,
        },
        data: {
          used_at: new Date(),
        },
      })

      return tx.password_Reset_Tokens.create({
        data: {
          user_id: data.userId,
          token_hash: data.tokenHash,
          expires_at: data.expiresAt,
        },
        select: {
          id: true,
          expires_at: true,
        },
      })
    })
  }

  static async findPasswordResetTokenByHash(tokenHash: string) {
    return prisma.password_Reset_Tokens.findUnique({
      where: { token_hash: tokenHash },
      include: {
        user: true,
      },
    })
  }

  static async resetPasswordAndRevokeSessions(
    data: ResetPasswordTransactionData,
  ) {
    return prisma.$transaction(async (tx) => {
      const consumedToken = await tx.password_Reset_Tokens.updateMany({
        where: {
          id: data.resetTokenId,
          used_at: null,
        },
        data: {
          used_at: data.changedAt,
        },
      })

      if (consumedToken.count !== 1) {
        throw createError(
          'Password reset token is invalid',
          401,
          {},
          'TOKEN_INVALID',
        )
      }

      const updatedUser = await tx.users.update({
        where: { id: data.userId },
        data: {
          password_hash: data.newPasswordHash,
          token_version: data.currentTokenVersion + 1,
          password_changed_at: data.changedAt,
        },
      })

      await tx.auth_Sessions.updateMany({
        where: {
          user_id: data.userId,
          revoked_at: null,
        },
        data: {
          revoked_at: data.changedAt,
        },
      })

      return updatedUser
    })
  }

  static async UpdateInvitationAndUserPassword(
    data: UpdateInvitationAndUserPasswordData,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: data.userId },
        data: {
          password_hash: data.newPasswordHash,
          status: 'ACTIVE',
        },
      })
      await tx.team_Invitations.update({
        where: { id: data.invitationId },
        data: {
          accepted_at: data.acceptedAt,
        },
      })
    })
  }
}

export default AuthRepo
