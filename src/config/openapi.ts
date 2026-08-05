import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'
import {
  changePasswordSchema,
  editUserDetailsSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  resetPasswordTokenParamsSchema,
} from '../modules/auth/auth.schemas'
import { TeamSchemas } from '../modules/team/team.schemas'

const registry = new OpenAPIRegistry()

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

const errorResponseSchema = registry.register(
  'ErrorResponse',
  z.object({
    success: z.literal(false),
    error: z.object({
      message: z.string(),
      code: z.string(),
      requestId: z.string(),
      details: z.unknown().optional(),
    }),
  }),
)

const loginResponseSchema = registry.register(
  'LoginResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      accessToken: z.string(),
      user: z.object({
        publicId: z.string(),
        fullName: z.string(),
        email: z.string().email(),
        role: z.enum(['ADMIN', 'ADVISOR', 'OPERATIONS']),
        status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']),
      }),
    }),
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const refreshResponseSchema = registry.register(
  'RefreshResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      accessToken: z.string(),
    }),
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const emptySuccessResponseSchema = registry.register(
  'EmptySuccessResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const verifyResetPasswordTokenResponseSchema = registry.register(
  'VerifyResetPasswordTokenResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      email: z.string().email(),
      fullName: z.string(),
    }),
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const verifyInvitationTokenResponseSchema = registry.register(
  'VerifyInvitationTokenResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      email: z.string().email(),
      fullName: z.string(),
    }),
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const safeUserSchema = z.object({
  public_id: z.string(),
  full_name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  role: z.enum(['ADMIN', 'ADVISOR', 'OPERATIONS']),
  status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']),
  last_login_at: z.date().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
})

const userDetailsResponseSchema = registry.register(
  'UserDetailsResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: safeUserSchema,
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const changePasswordResponseSchema = registry.register(
  'ChangePasswordResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      accessToken: z.string(),
      user: safeUserSchema,
    }),
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const sendInvitationResponseSchema = registry.register(
  'sendInvitationResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: safeUserSchema,
    meta: z.object({
      requestId: z.string(),
    }),
  }),
)

const registeredLoginSchema = registry.register('LoginRequest', loginSchema)
const registeredEditUserDetailsSchema = registry.register(
  'EditUserDetailsRequest',
  editUserDetailsSchema,
)
const registeredChangePasswordSchema = registry.register(
  'ChangePasswordRequest',
  changePasswordSchema,
)
const registeredForgotPasswordSchema = registry.register(
  'ForgotPasswordRequest',
  forgotPasswordSchema,
)
const registeredResetPasswordTokenParamsSchema = registry.register(
  'ResetPasswordTokenParams',
  resetPasswordTokenParamsSchema,
)
const registeredResetPasswordSchema = registry.register(
  'ResetPasswordRequest',
  resetPasswordSchema,
)

const registeredSendInvitationSchema = registry.register(
  'SendInvitationRequest',
  TeamSchemas.invitationSchema,
)

const refreshCookieParameter = z.object({
  refreshToken: z
    .string()
    .length(128)
    .openapi({
      description: 'Opaque refresh token issued by login or refresh.',
      param: {
        description: 'Opaque refresh token issued by login or refresh.',
      },
    }),
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  tags: ['Auth'],
  summary: 'Log in a staff user',
  description:
    'Validates staff credentials, creates a refresh-token session, sets an HttpOnly refreshToken cookie, and returns a short-lived access token.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registeredLoginSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description:
        'Login successful. The refresh token is returned as an HttpOnly cookie.',
      headers: {
        'Set-Cookie': {
          schema: { type: 'string' },
          description: 'HttpOnly refreshToken cookie; Secure in production.',
        },
      },
      content: {
        'application/json': {
          schema: loginResponseSchema,
        },
      },
    },
    400: {
      description: 'Request validation failed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: 'Invalid email or password.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: 'Account is not active.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/refresh',
  tags: ['Auth'],
  summary: 'Refresh a staff access token',
  description:
    'Reads the opaque refresh token from the HttpOnly refreshToken cookie, validates the stored auth session and client fingerprint, rotates the refresh-token hash in place, sets a new refreshToken cookie, and returns a new short-lived access token.',
  request: {
    cookies: refreshCookieParameter,
  },
  responses: {
    200: {
      description:
        'Refresh successful. The stored refresh-token hash is replaced and a rotated HttpOnly cookie is returned.',
      headers: {
        'Set-Cookie': {
          schema: { type: 'string' },
          description:
            'Rotated HttpOnly refreshToken cookie; Secure in production.',
        },
      },
      content: {
        'application/json': {
          schema: refreshResponseSchema,
        },
      },
    },
    400: {
      description: 'Refresh cookie is missing or malformed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description:
        'Refresh session was not found, expired, revoked, or failed fingerprint validation.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: 'Account is not active.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/forgot-password',
  tags: ['Auth'],
  summary: 'Request a password reset link',
  description:
    'Accepts a staff email address and always returns a generic success response. For active accounts only, the service creates a hashed single-use reset token and sends the raw token only inside the frontend reset-password email link.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registeredForgotPasswordSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description:
        'Generic response returned whether or not an active account exists.',
      content: {
        'application/json': {
          schema: emptySuccessResponseSchema,
        },
      },
    },
    400: {
      description: 'Request validation failed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})
registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/reset-password/{token}',
  tags: ['Auth'],
  summary: 'Verify a password reset token',
  description:
    'Validates a password-reset token from the frontend reset link. The raw token is hashed before lookup. The response returns only minimal public user state needed to render the reset form; it does not expose token hashes, token IDs, internal user IDs, account status, or password metadata.',
  request: {
    params: registeredResetPasswordTokenParamsSchema,
  },
  responses: {
    200: {
      description: 'Password reset token is valid and still usable.',
      content: {
        'application/json': {
          schema: verifyResetPasswordTokenResponseSchema,
        },
      },
    },
    400: {
      description: 'Token path parameter is malformed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: 'Token was not found, has already been used, or expired.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: 'The account is no longer active.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/reset-password/{token}',
  tags: ['Auth'],
  summary: 'Reset a staff password',
  description:
    'Validates a password-reset token and replacement password, consumes the reset token, updates the user password hash and token version, revokes all active refresh sessions for the user, and clears any refreshToken cookie on the response. It does not return access or refresh tokens.',
  request: {
    params: registeredResetPasswordTokenParamsSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registeredResetPasswordSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description:
        'Password reset, reset token consumed, active sessions revoked, and refreshToken cookie cleared.',
      headers: {
        'Set-Cookie': {
          schema: { type: 'string' },
          description: 'Clears the refreshToken cookie if present.',
        },
      },
      content: {
        'application/json': {
          schema: emptySuccessResponseSchema,
        },
      },
    },
    400: {
      description:
        'Token path parameter or password reset request body is malformed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: 'Token was not found, has already been used, or expired.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: 'The account is no longer active.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  summary: 'Log out the current staff session',
  description:
    'Requires a bearer access token and the refreshToken cookie. The refresh token is hashed, matched to the authenticated user and current access-token session, revoked, and then cleared from the browser.',
  request: {
    cookies: refreshCookieParameter,
  },
  responses: {
    200: {
      description: 'Current session revoked and refreshToken cookie cleared.',
      headers: {
        'Set-Cookie': {
          schema: { type: 'string' },
          description: 'Clears the refreshToken cookie.',
        },
      },
      content: {
        'application/json': {
          schema: emptySuccessResponseSchema,
        },
      },
    },
    400: {
      description: 'Refresh cookie is missing or malformed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description:
        'Bearer token is missing or invalid, or the refresh session was not found, revoked, or did not match the access token.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout-all',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  summary: 'Log out all staff sessions',
  description:
    'Requires a bearer access token and the refreshToken cookie. After validating the cookie session belongs to the authenticated user, all active auth sessions for that user are revoked by user_id and the refreshToken cookie is cleared.',
  request: {
    cookies: refreshCookieParameter,
  },
  responses: {
    200: {
      description: 'All active sessions for the authenticated user revoked.',
      headers: {
        'Set-Cookie': {
          schema: { type: 'string' },
          description: 'Clears the refreshToken cookie.',
        },
      },
      content: {
        'application/json': {
          schema: emptySuccessResponseSchema,
        },
      },
    },
    400: {
      description: 'Refresh cookie is missing or malformed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description:
        'Bearer token is missing or invalid, or the refresh session was not found, revoked, or did not belong to the authenticated user.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  summary: 'Get the authenticated staff user',
  description:
    'Requires a bearer access token and returns the safe staff user fields for the authenticated subject.',
  responses: {
    200: {
      description: 'Authenticated user details returned.',
      content: {
        'application/json': {
          schema: userDetailsResponseSchema,
        },
      },
    },
    401: {
      description:
        'Bearer token is missing or invalid, or the user was not found.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  summary: 'Update the authenticated staff user',
  description:
    'Requires a bearer access token. Allows the authenticated staff user to update their own fullName and phone only. Role, status, email, password, and token metadata are not editable from this endpoint.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registeredEditUserDetailsSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Authenticated user details updated.',
      content: {
        'application/json': {
          schema: userDetailsResponseSchema,
        },
      },
    },
    400: {
      description: 'Request validation failed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description:
        'Bearer token is missing or invalid, the session was revoked or expired, or the user was not found.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: 'Account is not active.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/change-password',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  summary: 'Change the authenticated staff password',
  description:
    'Requires a bearer access token. Verifies the current password, enforces the password policy, updates the password hash and token version, revokes every other active refresh session, rotates the current refresh-token cookie, and returns a fresh access token.',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registeredChangePasswordSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description:
        'Password changed, other active sessions revoked, and current refreshToken cookie rotated.',
      headers: {
        'Set-Cookie': {
          schema: { type: 'string' },
          description:
            'Rotated HttpOnly refreshToken cookie; Secure in production.',
        },
      },
      content: {
        'application/json': {
          schema: changePasswordResponseSchema,
        },
      },
    },
    400: {
      description: 'Request validation failed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description:
        'Bearer token is missing or invalid, the current password is wrong, the session was revoked or expired, or the user was not found.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    403: {
      description: 'Account is not active.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/team',
  tags: ['team'],
  security: [{ bearerAuth: [] }],
  summary: 'Invite a new user based on a role as an admin',
  description:
    'Requires a bearer access token, enforces the role permission, creates both a token and its hash,  add the token to the url , sends the url in the email and returns an email sent successfully message',
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registeredSendInvitationSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Invitation Email sent successfully',
      content: {
        'application/json': {
          schema: sendInvitationResponseSchema,
        },
      },
    },
    400: {
      description: 'Request validation failed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: '',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/invitations/{token}',
  tags: ['Auth'],
  summary: 'Verify an invitation token',
  description:
    "Validates an invitation token from the set-password link. The raw token is hashed before lookup. Returns the invited user's email and full name if valid.",
  request: {
    params: registeredResetPasswordTokenParamsSchema,
  },
  responses: {
    200: {
      description: 'Invitation token is valid.',
      content: {
        'application/json': {
          schema: verifyInvitationTokenResponseSchema,
        },
      },
    },
    400: {
      description: 'Token parameter is malformed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: 'Token not found, has already been used, or expired.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/invitations/{token}/accept',
  tags: ['Auth'],
  summary: 'Accept an invitation and set password',
  description:
    "Accepts a pending invitation by setting the user's password and activating the account. The raw token is hashed before lookup. Rejects if the invitation is already accepted, canceled, or expired.",
  request: {
    params: registeredResetPasswordTokenParamsSchema,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: registeredResetPasswordSchema,
        },
      },
    },
  },
  responses: {
    204: {
      description: 'Invitation accepted and password set successfully.',
    },
    400: {
      description: 'Validation failed or token parameter is malformed.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
    401: {
      description: 'Token not found, has already been used, or expired.',
      content: {
        'application/json': {
          schema: errorResponseSchema,
        },
      },
    },
  },
})

export const openApiDocument = new OpenApiGeneratorV31(
  registry.definitions,
).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'School Finder Backend API',
    version: '1.0.0',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Current API version',
    },
  ],
})
