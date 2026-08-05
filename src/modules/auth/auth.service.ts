import { randomUUID } from 'node:crypto'
import { AUTH_ERROR_CODES } from '../../common/errors/errorCodes'
import { createError } from '../../common/errors/AppError'
import {
  generateOpaqueToken,
  hashOpaqueToken,
} from '../../common/security/opaqueToken'
import { hashPassword, verifyPassword } from '../../common/security/password'
import {
  generateAcessToken,
  generateRefreshToken,
} from '../../common/security/token'
import { hashRefreshToken } from '../../common/security/tokenHash'
import env from '../../config/env'
import { logger } from '../../config/logger'
import EmailProvider from '../../integrations/email/email.provider'
import { buildPasswordResetEmail } from '../../integrations/email/email.templates'
import AuthRepo from './auth.repository'
import TeamRepo from '../team/team.repository'
import type {
  AccessTokenClaims,
  ChangePasswordData,
  AuthenticatedRefreshT,
  AuthSessionDbData,
  EditUserDetailsT,
  LoginT,
  RefreshT,
  ForgotPasswordData,
  ResetPasswordData,
  VerifiedResetPasswordToken,
} from './auth.types'

const passwordPolicyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
const passwordResetTokenTtlMinutes = 60
const opaqueTokenRegex = /^[a-f0-9]{128}$/i

const toSafeUser = (user: {
  public_id: string
  full_name: string
  email: string
  phone: string | null
  role: string
  status: string
  last_login_at: Date | null
  created_at: Date
  updated_at: Date
}) => {
  return {
    public_id: user.public_id,
    full_name: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at,
  }
}

class AuthService {
  static Login = async (requestBody: LoginT) => {
    const user = await AuthRepo.findUser({ email: requestBody.email })

    if (!user?.password_hash) {
      throw createError(
        'Invalid email or password',
        401,
        {},
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    }

    if (user.status !== 'ACTIVE') {
      throw createError(
        'Account is not active',
        403,
        {},
        AUTH_ERROR_CODES.ACCOUNT_DISABLED,
      )
    }

    const passwordMatches = await verifyPassword(
      user.password_hash,
      requestBody.password,
    )

    if (!passwordMatches) {
      throw createError(
        'Invalid email or password',
        401,
        {},
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    }

    const refreshToken = generateRefreshToken()
    const refreshTokenHash = hashRefreshToken(refreshToken)
    const tokenFamily = randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const createAuthSessionData: AuthSessionDbData = {
      user_id: user.id,
      refreshTokenHash,
      tokenFamily,
      userAgent: requestBody.userAgent,
      ipAddress: requestBody.ipAddress,
      expiresAt,
    }

    const authSession = await AuthRepo.createAuthSession(createAuthSessionData)
    await AuthRepo.updateLastLogin(user.id)

    const accessToken = generateAcessToken(
      user.id,
      authSession.id,
      user.role,
      user.token_version,
    )

    const data = {
      accessToken,
      user: {
        publicId: user.public_id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    }

    return { data, refreshToken }
  }

  static Refresh = async (data: RefreshT) => {
    const hashedRefreshToken = hashRefreshToken(data.refreshToken)
    const authSession = await AuthRepo.findAuthSession(hashedRefreshToken)

    if (!authSession?.refresh_token_hash) {
      throw createError(
        'Authentication session not found or has expired',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND,
      )
    }

    const authExpiryDate = new Date(authSession.expires_at)
    if (authExpiryDate <= new Date()) {
      await AuthRepo.revokeAuthSession(authSession.id)
      throw createError(
        'Authentication session has expired, please log in again',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_EXPIRED,
      )
    }

    if (authSession.revoked_at) {
      throw createError(
        'Authentication session revoked, please log in again',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_REVOKED,
      )
    }

    const user = await AuthRepo.findUser({ id: authSession.user_id })
    if (user?.status !== 'ACTIVE') {
      throw createError(
        'Account is not active',
        403,
        {},
        AUTH_ERROR_CODES.ACCOUNT_DISABLED,
      )
    }

    if (
      authSession.ip_address !== data.ipAddress ||
      authSession.user_agent !== data.userAgent
    ) {
      await AuthRepo.revokeAuthSession(authSession.id)
      throw createError(
        'Session device mismatch detected. Please log in again.',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_DEVICE_MISMATCH,
      )
    }

    const newRefreshToken = generateRefreshToken()
    const newHashedRefreshToken = hashRefreshToken(newRefreshToken)

    const rotateAuthSession = await AuthRepo.rotateRefreshToken({
      authSessionId: authSession.id,
      lastUsedAt: new Date(),
      hashedRefreshToken: newHashedRefreshToken,
    })

    const accessToken = generateAcessToken(
      user.id,
      rotateAuthSession.id,
      user.role,
      user.token_version,
    )

    return { newRefreshToken, accessToken }
  }

  static Logout = async (data: AuthenticatedRefreshT) => {
    const hashedRefreshToken = hashRefreshToken(data.refreshToken)
    const findSession = await AuthRepo.findAuthSession(hashedRefreshToken)

    if (!findSession) {
      throw createError(
        'Authentication session not found or has expired',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND,
      )
    }

    if (
      findSession.user_id !== data.sub ||
      findSession.id !== data.session_Id
    ) {
      throw createError(
        'Authentication session does not match the access token',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_DEVICE_MISMATCH,
      )
    }

    if (findSession.revoked_at) {
      throw createError(
        'Authentication session revoked, please log in again',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_REVOKED,
      )
    }

    await AuthRepo.revokeAuthSession(findSession.id)
  }

  static LogoutAll = async (data: AuthenticatedRefreshT) => {
    const hashedRefreshToken = hashRefreshToken(data.refreshToken)
    const findSession = await AuthRepo.findAuthSession(hashedRefreshToken)

    if (!findSession) {
      throw createError(
        'Authentication session not found or has expired',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND,
      )
    }

    if (findSession.user_id !== data.sub) {
      throw createError(
        'Authentication session does not match the access token',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_DEVICE_MISMATCH,
      )
    }

    if (findSession.revoked_at) {
      throw createError(
        'Authentication session revoked, please log in again',
        401,
        {},
        AUTH_ERROR_CODES.AUTH_SESSION_REVOKED,
      )
    }

    await AuthRepo.revokeAuthSessionFamily(data.sub)
  }

  static UserDetails = async (data: AccessTokenClaims) => {
    const findUser = await AuthRepo.findUser({ id: data.sub })
    if (!findUser) {
      throw createError(
        'Unable to get user',
        401,
        {},
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    }

    return toSafeUser(findUser)
  }

  static EditUserDetails = async (
    auth: AccessTokenClaims,
    data: EditUserDetailsT,
  ) => {
    const findUser = await AuthRepo.findUser({ id: auth.sub })
    if (!findUser) {
      throw createError(
        'Unable to get user',
        401,
        {},
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    }

    const updatedUser = await AuthRepo.updateUserDetails(auth.sub, data)
    return toSafeUser(updatedUser)
  }

  static ChangePassword = async (
    auth: AccessTokenClaims,
    data: ChangePasswordData,
  ) => {
    if (data.newPassword !== data.confirmNewPassword) {
      throw createError('Passwords do not match', 400, {}, 'VALIDATION_ERROR')
    }

    if (!passwordPolicyRegex.test(data.newPassword)) {
      throw createError(
        'Password must be at least 8 characters and include uppercase, lowercase, and number characters',
        400,
        {},
        'VALIDATION_ERROR',
      )
    }

    const user = await AuthRepo.findUser({ id: auth.sub })
    if (!user?.password_hash) {
      throw createError(
        'Invalid current password',
        401,
        {},
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    }

    const passwordMatches = await verifyPassword(
      user.password_hash,
      data.currentPassword,
    )
    if (!passwordMatches) {
      throw createError(
        'Invalid current password',
        401,
        {},
        AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      )
    }

    const newPasswordMatchesCurrent = await verifyPassword(
      user.password_hash,
      data.newPassword,
    )
    if (newPasswordMatchesCurrent) {
      throw createError(
        'New password must be different from the current password',
        400,
        {},
        'VALIDATION_ERROR',
      )
    }

    const newPasswordHash = await hashPassword(data.newPassword)
    const newRefreshToken = generateRefreshToken()
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken)
    const updatedUser = await AuthRepo.changePasswordAndRotateSessions({
      userId: user.id,
      currentSessionId: auth.session_Id,
      newPasswordHash,
      newRefreshTokenHash,
      currentTokenVersion: user.token_version,
      changedAt: new Date(),
    })

    const accessToken = generateAcessToken(
      updatedUser.id,
      auth.session_Id,
      updatedUser.role,
      updatedUser.token_version,
    )

    return {
      user: toSafeUser(updatedUser),
      accessToken,
      refreshToken: newRefreshToken,
    }
  }

  static ForgotPassword = async (data: ForgotPasswordData) => {
    const email = data.email.trim().toLowerCase()
    const user = await AuthRepo.findUser({ email })

    if (!user || user.status !== 'ACTIVE') {
      return
    }

    const resetToken = generateOpaqueToken()
    const tokenHash = hashOpaqueToken(resetToken)
    const expiresAt = new Date(
      Date.now() + passwordResetTokenTtlMinutes * 60 * 1000,
    )

    await AuthRepo.createPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    const resetUrl = new URL(`/reset-password/${resetToken}`, env.frontendUrl)
      .href

    try {
      await EmailProvider.send(
        buildPasswordResetEmail({
          to: user.email,
          fullName: user.full_name,
          resetUrl,
          expiresInMinutes: passwordResetTokenTtlMinutes,
        }),
      )
    } catch (error) {
      logger.error(
        {
          err: error,
          userId: user.id,
          resetTokenExpiresAt: expiresAt,
        },
        'Password reset email delivery failed',
      )
    }
  }

  static VerifyResetPasswordToken = async (
    token: string,
  ): Promise<VerifiedResetPasswordToken> => {
    if (!token || !opaqueTokenRegex.test(token)) {
      throw createError(
        'Password reset token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    const tokenHash = hashOpaqueToken(token)
    const resetToken = await AuthRepo.findPasswordResetTokenByHash(tokenHash)

    if (!resetToken || resetToken.used_at) {
      throw createError(
        'Password reset token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    if (resetToken.expires_at <= new Date()) {
      throw createError(
        'Password reset token has expired',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_EXPIRED,
      )
    }

    if (resetToken.user.status !== 'ACTIVE') {
      throw createError(
        'Account is not active',
        403,
        {},
        AUTH_ERROR_CODES.ACCOUNT_DISABLED,
      )
    }

    logger.info(
      {
        userId: resetToken.user_id,
        passwordResetTokenId: resetToken.id,
        resetTokenExpiresAt: resetToken.expires_at,
      },
      'Password reset token verified',
    )

    return {
      email: resetToken.user.email,
      fullName: resetToken.user.full_name,
    }
  }

  static ResetPassword = async (token: string, data: ResetPasswordData) => {
    if (data.newPassword !== data.confirmNewPassword) {
      throw createError('Passwords do not match', 400, {}, 'VALIDATION_ERROR')
    }

    if (!passwordPolicyRegex.test(data.newPassword)) {
      throw createError(
        'Password must be at least 8 characters and include uppercase, lowercase, and number characters',
        400,
        {},
        'VALIDATION_ERROR',
      )
    }

    if (!token || !opaqueTokenRegex.test(token)) {
      throw createError(
        'Password reset token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    const tokenHash = hashOpaqueToken(token)
    const resetToken = await AuthRepo.findPasswordResetTokenByHash(tokenHash)

    if (!resetToken || resetToken.used_at) {
      throw createError(
        'Password reset token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    if (resetToken.expires_at <= new Date()) {
      throw createError(
        'Password reset token has expired',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_EXPIRED,
      )
    }

    if (resetToken.user.status !== 'ACTIVE') {
      throw createError(
        'Account is not active',
        403,
        {},
        AUTH_ERROR_CODES.ACCOUNT_DISABLED,
      )
    }

    if (resetToken.user.password_hash) {
      const newPasswordMatchesCurrent = await verifyPassword(
        resetToken.user.password_hash,
        data.newPassword,
      )

      if (newPasswordMatchesCurrent) {
        throw createError(
          'New password must be different from the current password',
          400,
          {},
          'VALIDATION_ERROR',
        )
      }
    }

    const changedAt = new Date()
    const newPasswordHash = await hashPassword(data.newPassword)

    await AuthRepo.resetPasswordAndRevokeSessions({
      resetTokenId: resetToken.id,
      userId: resetToken.user_id,
      newPasswordHash,
      currentTokenVersion: resetToken.user.token_version,
      changedAt,
    })

    logger.info(
      {
        userId: resetToken.user_id,
        passwordResetTokenId: resetToken.id,
        passwordChangedAt: changedAt,
      },
      'Password reset completed',
    )
  }
  static VerifyInvitationToken = async (token: string) => {
    if (!token || !opaqueTokenRegex.test(token)) {
      throw createError(
        'Invitation token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    const tokenHash = hashOpaqueToken(token)
    const invitationToken = await TeamRepo.FindTeamInvitation({
      token_hash: tokenHash,
    })

    if (
      !invitationToken ||
      invitationToken.accepted_at ||
      invitationToken.canceled_at
    ) {
      throw createError(
        'Invitation token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    if (invitationToken.expires_at <= new Date()) {
      throw createError(
        'Invitation token has expired',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_EXPIRED,
      )
    }

    logger.info(
      {
        userId: invitationToken.user_id,
        invitationTokenId: invitationToken.id,
        invitationExpiresAt: invitationToken.expires_at,
      },
      'Invitation rest token verified',
    )

    return {
      fullName: invitationToken.user.full_name,
      email: invitationToken.user.email,
    }
  }
  static ResetPasswordFromInvitation = async (
    token: string,
    data: ResetPasswordData,
  ) => {
    if (data.newPassword !== data.confirmNewPassword) {
      throw createError('Passwords do not match', 400, {}, 'VALIDATION_ERROR')
    }

    if (!passwordPolicyRegex.test(data.newPassword)) {
      throw createError(
        'Password must be at least 8 characters and include uppercase, lowercase, and number characters',
        400,
        {},
        'VALIDATION_ERROR',
      )
    }

    if (!token || !opaqueTokenRegex.test(token)) {
      throw createError(
        'Password reset token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    const tokenHash = hashOpaqueToken(token)
    const invitationToken = await TeamRepo.FindTeamInvitation({
      token_hash: tokenHash,
    })

    if (
      !invitationToken ||
      invitationToken.accepted_at ||
      invitationToken.canceled_at
    ) {
      throw createError(
        'Invitation token is invalid',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_INVALID,
      )
    }

    if (invitationToken.expires_at <= new Date()) {
      throw createError(
        'Invitation token has expired',
        401,
        {},
        AUTH_ERROR_CODES.TOKEN_EXPIRED,
      )
    }

    const newPasswordHash = await hashPassword(data.newPassword)
    const acceptedAt = new Date()

    await AuthRepo.UpdateInvitationAndUserPassword({
      userId: invitationToken.user_id,
      newPasswordHash,
      acceptedAt: acceptedAt,
      invitationId: invitationToken.id,
    })
  }
}

export default AuthService
