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

export const authRouter: Router = express.Router()

authRouter.post(
  '/login',
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
  validate(forgotPasswordSchema),
  AuthController.ForgotPassword,
)

authRouter.get(
  '/reset-password/:token',
  validateParams(resetPasswordTokenParamsSchema),
  AuthController.VerifyResetPasswordToken,
)

authRouter.post(
  '/reset-password/:token',
  validateParams(resetPasswordTokenParamsSchema),
  validate(resetPasswordSchema),
  AuthController.ResetPassword,
)

// TEAM
authRouter.get(
  '/invitations/:token',
  validateParams(resetPasswordTokenParamsSchema),
  AuthController.VerifyInvitationToken,
)

authRouter.post(
  '/invitations/:token/accept',
  validateParams(resetPasswordTokenParamsSchema),
  validate(resetPasswordSchema),
  AuthController.ResetPasswordFromInvitation,
)
