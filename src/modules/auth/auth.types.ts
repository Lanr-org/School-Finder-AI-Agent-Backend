export interface ClientInfo {
  ipAddress: string | null
  userAgent: string | null
}

export interface LoginT extends ClientInfo {
  email: string
  password: string
}

export type RefreshT = ClientInfo & {
  refreshToken: string
}

export type EditUserDetailsT = {
  fullName?: string
  phone?: string | null
}

export type AuthSessionDbData = {
  user_id: string
  refreshTokenHash: string
  tokenFamily: string
  userAgent: string | null
  ipAddress: string | null
  expiresAt: Date
}

export type RotateRefreshTokenData = {
  authSessionId: string
  lastUsedAt: Date
  hashedRefreshToken: string
}

export type AccessTokenClaims = {
  sub: string
  session_Id: string
  role: string
  token_version: number
}

export type AuthenticatedRefreshT = AccessTokenClaims & {
  refreshToken: string
}

export type ChangePasswordData = {
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

export type ResetPasswordData = {
  newPassword: string
  confirmNewPassword: string
}

export type ChangePasswordTransactionData = {
  userId: string
  currentSessionId: string
  newPasswordHash: string
  newRefreshTokenHash: string
  currentTokenVersion: number
  changedAt: Date
}

export type ForgotPasswordData = {
  email: string
}

export type PasswordResetTokenDbData = {
  userId: string
  tokenHash: string
  expiresAt: Date
}

export type VerifiedResetPasswordToken = {
  email: string
  fullName: string
}

export type ResetPasswordTransactionData = {
  resetTokenId: string
  userId: string
  newPasswordHash: string
  currentTokenVersion: number
  changedAt: Date
}

export type UpdateInvitationAndUserPasswordData = {
  userId: string
  newPasswordHash: string
  acceptedAt: Date
  invitationId: string
}
