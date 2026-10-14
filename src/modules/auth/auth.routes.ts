import express, { type Router } from 'express'
import {
  validate,
  validateParams,
  validateRefreshToken,
} from '../../middleware/validate'
import AuthController from './auth.controller'
import {
  changePasswordSchema,
  editUserDetailsSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  resetPasswordTokenParamsSchema,
} from './auth.schemas'
import { clientInfo } from '../../middleware/clientInfo'
import { AuthenticateMiddleware } from '../../middleware/authenticate'
import { createRateLimit } from '../../middleware/rateLimit'

export const authRouter: Router = express.Router()

// Brute-force protection for the public staff routes. Login counts only failed attempts, per IP
// and per email, so one network can't hammer an account and a single account can't be guessed
// from many IPs. Keys use the email as typed, lowercased, before validation runs.
const emailKey = (prefix: string) => (req: express.Request) => {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email
  return `${prefix}:${typeof email === 'string' ? email.trim().toLowerCase() : ''}`
}
const loginPerIp = createRateLimit(20, 15, undefined, { failedOnly: true })
const loginPerEmail = createRateLimit(10, 15, emailKey('login'), {
  failedOnly: true,
})
const forgotPerIp = createRateLimit(5, 60)
const forgotPerEmail = createRateLimit(3, 60, emailKey('forgot'))
const tokenPerIp = createRateLimit(20, 15)

authRouter.post(
  '/login',
  loginPerIp,
  loginPerEmail,
  validate(loginSchema),
  clientInfo,
  AuthController.Login,
)
authRouter.post(
  '/refresh',
  validateRefreshToken(refreshTokenSchema),
  clientInfo,
  AuthController.Refresh,
)
authRouter.post(
  '/logout',
  validateRefreshToken(refreshTokenSchema),
  AuthenticateMiddleware,
  AuthController.Logout,
)
authRouter.post(
  '/logout-all',
  validateRefreshToken(refreshTokenSchema),
  AuthenticateMiddleware,
  AuthController.LogoutAll,
)
authRouter.get('/me', AuthenticateMiddleware, AuthController.UserDetails)

authRouter.patch(
  '/me',
  validate(editUserDetailsSchema),
  AuthenticateMiddleware,
  AuthController.EditUserDetails,
)

authRouter.post(
  '/change-password',
  validate(changePasswordSchema),
  AuthenticateMiddleware,
  AuthController.ChangePassword,
)

authRouter.post(
  '/forgot-password',
  forgotPerIp,
  forgotPerEmail,
  validate(forgotPasswordSchema),
  AuthController.ForgotPassword,
)

authRouter.get(
  '/reset-password/:token',
  tokenPerIp,
  validateParams(resetPasswordTokenParamsSchema),
  AuthController.VerifyResetPasswordToken,
)

authRouter.post(
  '/reset-password/:token',
  tokenPerIp,
  validateParams(resetPasswordTokenParamsSchema),
  validate(resetPasswordSchema),
  AuthController.ResetPassword,
)

// TEAM
authRouter.get(
  '/invitations/:token',
  tokenPerIp,
  validateParams(resetPasswordTokenParamsSchema),
  AuthController.VerifyInvitationToken,
)

authRouter.post(
  '/invitations/:token/accept',
  tokenPerIp,
  validateParams(resetPasswordTokenParamsSchema),
  validate(resetPasswordSchema),
  AuthController.ResetPasswordFromInvitation,
)
