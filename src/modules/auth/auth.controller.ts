import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../../http/response'
import { clearCookie, setCookie } from '../../http/cookie'
import AuthService from './auth.service'
import type {
  ChangePasswordData,
  EditUserDetailsT,
  ForgotPasswordData,
  LoginT,
  RefreshT,
  ResetPasswordData,
} from './auth.types'

const getRefreshTokenFromRequest = (req: Request): string => {
  return (req.body as { refreshToken: string }).refreshToken
}

class AuthController {
  static Login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loginUser = await AuthService.Login(req.body as LoginT)

      setCookie(res, loginUser.refreshToken)
      res.status(200).send(
        successResponse(true, 'Login successful', loginUser.data, {
          requestId: req.id,
        }),
      )
    } catch (err) {
      next(err)
    }
  }

  static Refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = await AuthService.Refresh(req.body as RefreshT)
      setCookie(res, refreshToken.newRefreshToken)
      res
        .status(200)
        .send(
          successResponse(
            true,
            'Refresh successful',
            { accessToken: refreshToken.accessToken },
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  static Logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) {
        throw new Error('Authenticated request missing auth claims')
      }

      await AuthService.Logout({
        ...req.auth,
        refreshToken: getRefreshTokenFromRequest(req),
      })
      clearCookie(res)
      res.status(200).send(
        successResponse(true, 'Successfully logged out', undefined, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  static LogoutAll = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.auth) {
        throw new Error('Authenticated request missing auth claims')
      }

      await AuthService.LogoutAll({
        ...req.auth,
        refreshToken: getRefreshTokenFromRequest(req),
      })
      clearCookie(res)
      res.status(200).send(
        successResponse(true, 'All sessions logged out', undefined, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  static UserDetails = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.auth) {
        throw new Error('Authenticated request missing auth claims')
      }

      const getUserDetails = await AuthService.UserDetails(req.auth)
      res
        .status(200)
        .send(
          successResponse(
            true,
            'User details retrieved successfully',
            getUserDetails,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  static EditUserDetails = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.auth) {
        throw new Error('Authenticated request missing auth claims')
      }

      const updatedUserDetails = await AuthService.EditUserDetails(
        req.auth,
        req.body as EditUserDetailsT,
      )
      res
        .status(200)
        .send(
          successResponse(
            true,
            'User details updated successfully',
            updatedUserDetails,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  static ChangePassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.auth) {
        throw new Error('Authenticated request missing auth claims')
      }

      const changePasswordResult = await AuthService.ChangePassword(
        req.auth,
        req.body as ChangePasswordData,
      )
      setCookie(res, changePasswordResult.refreshToken)
      res.status(200).send(
        successResponse(
          true,
          'Password changed successfully',
          {
            user: changePasswordResult.user,
            accessToken: changePasswordResult.accessToken,
          },
          { requestId: req.id },
        ),
      )
    } catch (error) {
      next(error)
    }
  }

  static ForgotPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      await AuthService.ForgotPassword(req.body as ForgotPasswordData)
      res
        .status(200)
        .send(
          successResponse(
            true,
            'If an active account exists for that email, a password reset link has been sent',
            undefined,
            { requestId: req.id },
          ),
        )
    } catch (error) {
      next(error)
    }
  }

  static VerifyResetPasswordToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { token } = req.params
      const verifiedToken = await AuthService.VerifyResetPasswordToken(
        token as string,
      )

      res.status(200).send(
        successResponse(true, 'Password reset token is valid', verifiedToken, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  static ResetPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { token } = req.params
      await AuthService.ResetPassword(
        token as string,
        req.body as ResetPasswordData,
      )

      clearCookie(res)
      res.status(200).send(
        successResponse(true, 'Password reset successfully', undefined, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }

  static VerifyInvitationToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { token } = req.params
      const verifiedToken = await AuthService.VerifyInvitationToken(
        token as string,
      )
      res.status(200).send(
        successResponse(
          true,
          'Invitation verification token is valid',
          verifiedToken,
          {
            requestId: req.id,
          },
        ),
      )
    } catch (error) {
      next(error)
    }
  }

  static ResetPasswordFromInvitation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { token } = req.params
      await AuthService.ResetPasswordFromInvitation(
        token as string,
        req.body as ResetPasswordData,
      )
      res.status(204).send(
        successResponse(true, 'Password reset successfully', undefined, {
          requestId: req.id,
        }),
      )
    } catch (error) {
      next(error)
    }
  }
}

export default AuthController
