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
import { SchoolsSchemas } from '../modules/schools/schools.schemas'
import { ProgramsSchemas } from '../modules/programs/programs.schemas'
import { StudentsSchemas } from '../modules/students/students.schemas'
import { ApplicationsSchemas } from '../modules/applications/applications.schemas'
import { AuditSchemas } from '../modules/audit/audit.schemas'
import {
  AUDIT_ACTION_VALUES,
  AUDIT_ENTITY_TYPES,
} from '../modules/audit/audit.actions'

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

// ==========================================
// SCHOOLS
// ==========================================

const schoolDataSchema = z.object({
  publicId: z.string(),
  name: z.string(),
  schoolType: z.enum(['UNIVERSITY', 'COLLEGE', 'INSTITUTE', 'POLYTECHNIC']),
  recordStatus: z.enum(['ACTIVE', 'INACTIVE']),
  description: z.string().nullable(),

  website: z.string().nullable(),
  admissionsEmail: z.string().nullable(),
  phoneNumbers: z.array(z.string()),

  streetAddress: z.string().nullable(),
  city: z.string(),
  country: z.string(),
  postalCode: z.string().nullable(),

  partnerStatus: z.enum(['PARTNER', 'PROSPECT', 'NON_PARTNER']),
  visaFriendlinessScore: z.number().nullable(),
  visaFriendlinessNotes: z.string().nullable(),
  admissionFriendlinessScore: z.number().nullable(),
  admissionFriendlinessNotes: z.string().nullable(),
  rankingReputationNotes: z.string().nullable(),

  createdAt: z.date(),
  updatedAt: z.date(),
})

const schoolResponseSchema = registry.register(
  'SchoolResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: schoolDataSchema,
    meta: z.object({ requestId: z.string() }),
  }),
)

const schoolListResponseSchema = registry.register(
  'SchoolListResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      schools: z.array(schoolDataSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      }),
    }),
    meta: z.object({ requestId: z.string() }),
  }),
)

const registeredCreateSchoolSchema = registry.register(
  'CreateSchoolRequest',
  SchoolsSchemas.createSchoolSchema,
)
const registeredUpdateSchoolSchema = registry.register(
  'UpdateSchoolRequest',
  SchoolsSchemas.updateSchoolSchema,
)
const registeredSchoolIdParamsSchema = registry.register(
  'SchoolIdParams',
  SchoolsSchemas.schoolIdParamsSchema,
)
const registeredListSchoolsQuerySchema = registry.register(
  'ListSchoolsQuery',
  SchoolsSchemas.listSchoolsQuerySchema,
)

registry.registerPath({
  method: 'get',
  path: '/api/v1/schools',
  tags: ['Schools'],
  security: [{ bearerAuth: [] }],
  summary: 'List schools',
  description:
    'Requires a bearer access token. Returns a paginated, filterable list of schools for admin/operations staff — filterable by country, city, school type, partner status, record status, and free-text name search.',
  request: {
    query: registeredListSchoolsQuerySchema,
  },
  responses: {
    200: {
      description: 'Schools retrieved successfully.',
      content: { 'application/json': { schema: schoolListResponseSchema } },
    },
    400: {
      description: 'Query parameter validation failed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/schools',
  tags: ['Schools'],
  security: [{ bearerAuth: [] }],
  summary: 'Create a school',
  description:
    'Requires a bearer access token. Creates a new school profile with contact/website, location, and partnership & internal-assessment details, and returns the created record with a generated public ID (e.g. SCH-1234).',
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: registeredCreateSchoolSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'School created successfully.',
      content: { 'application/json': { schema: schoolResponseSchema } },
    },
    400: {
      description: 'Request validation failed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/schools/{schoolId}',
  tags: ['Schools'],
  security: [{ bearerAuth: [] }],
  summary: 'Get a school by public ID',
  description:
    'Requires a bearer access token. Looks up a school by its public display ID (e.g. SCH-1234).',
  request: { params: registeredSchoolIdParamsSchema },
  responses: {
    200: {
      description: 'School retrieved successfully.',
      content: { 'application/json': { schema: schoolResponseSchema } },
    },
    400: {
      description: 'schoolId path parameter is malformed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'School not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/schools/{schoolId}',
  tags: ['Schools'],
  security: [{ bearerAuth: [] }],
  summary: 'Update a school',
  description:
    'Requires a bearer access token. Partially updates a school profile by public ID; at least one field must be provided.',
  request: {
    params: registeredSchoolIdParamsSchema,
    body: {
      required: true,
      content: {
        'application/json': { schema: registeredUpdateSchoolSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'School updated successfully.',
      content: { 'application/json': { schema: schoolResponseSchema } },
    },
    400: {
      description: 'Request validation failed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'School not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'delete',
  path: '/api/v1/schools/{schoolId}',
  tags: ['Schools'],
  security: [{ bearerAuth: [] }],
  summary: 'Deactivate a school (soft delete)',
  description:
    'Requires a bearer access token. Sets the school record_status to INACTIVE by public ID; the row is retained, not removed. Returns a conflict if the school is already inactive.',
  request: { params: registeredSchoolIdParamsSchema },
  responses: {
    200: {
      description: 'School deactivated successfully.',
      content: { 'application/json': { schema: schoolResponseSchema } },
    },
    400: {
      description: 'schoolId path parameter is malformed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'School not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    409: {
      description: 'School is already inactive.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

// ==========================================
// PROGRAMS
// ==========================================

const programDataSchema = z.object({
  publicId: z.string(),
  name: z.string(),
  studyLevel: z.enum(['UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORATE', 'FOUNDATION']),
  qualification: z.string(),
  category: z.string(),
  duration: z.string(),
  school: z.object({ publicId: z.string(), name: z.string() }),

  tuitionAmount: z.union([z.number(), z.string()]),
  tuitionCurrency: z.string(),
  scholarshipAvailability: z.string().nullable(),

  intakePeriods: z.array(
    z.enum([
      'JANUARY',
      'FEBRUARY',
      'MARCH',
      'APRIL',
      'MAY',
      'JUNE',
      'JULY',
      'AUGUST',
      'SEPTEMBER',
      'OCTOBER',
      'NOVEMBER',
      'DECEMBER',
    ]),
  ),
  applicationDeadline: z.date().nullable(),
  primaryIntakeYear: z.number().nullable(),

  academicRequirements: z.string().nullable(),
  englishRequirements: z.string().nullable(),
  operationNotes: z.string().nullable(),

  createdAt: z.date(),
  updatedAt: z.date(),
})

const programResponseSchema = registry.register(
  'ProgramResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: programDataSchema,
    meta: z.object({ requestId: z.string() }),
  }),
)

const programListResponseSchema = registry.register(
  'ProgramListResponse',
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      programs: z.array(programDataSchema),
      pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
      }),
    }),
    meta: z.object({ requestId: z.string() }),
  }),
)

const registeredCreateProgramSchema = registry.register(
  'CreateProgramRequest',
  ProgramsSchemas.createProgramSchema,
)
const registeredUpdateProgramSchema = registry.register(
  'UpdateProgramRequest',
  ProgramsSchemas.updateProgramSchema,
)
const registeredProgramIdParamsSchema = registry.register(
  'ProgramIdParams',
  ProgramsSchemas.programIdParamsSchema,
)
const registeredListProgramsQuerySchema = registry.register(
  'ListProgramsQuery',
  ProgramsSchemas.listProgramsQuerySchema,
)
const registeredListSchoolProgramsQuerySchema = registry.register(
  'ListSchoolProgramsQuery',
  ProgramsSchemas.listSchoolProgramsQuerySchema,
)

registry.registerPath({
  method: 'get',
  path: '/api/v1/programs',
  tags: ['Programs'],
  security: [{ bearerAuth: [] }],
  summary: 'List programs',
  description:
    'Requires a bearer access token. Returns a paginated, filterable list of programs — filterable by school (public ID), study level, category, and free-text name search.',
  request: {
    query: registeredListProgramsQuerySchema,
  },
  responses: {
    200: {
      description: 'Programs retrieved successfully.',
      content: { 'application/json': { schema: programListResponseSchema } },
    },
    400: {
      description: 'Query parameter validation failed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'The school referenced by the schoolId filter was not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/programs',
  tags: ['Programs'],
  security: [{ bearerAuth: [] }],
  summary: 'Create a program',
  description:
    'Requires a bearer access token. Creates a new program under an existing school (identified by its public school ID), with tuition/funding, intake, entry-requirement, and internal operations details, and returns the created record with a generated public ID (e.g. PRG-1234).',
  request: {
    body: {
      required: true,
      content: {
        'application/json': { schema: registeredCreateProgramSchema },
      },
    },
  },
  responses: {
    201: {
      description: 'Program created successfully.',
      content: { 'application/json': { schema: programResponseSchema } },
    },
    400: {
      description: 'Request validation failed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'The referenced school was not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/programs/{programId}',
  tags: ['Programs'],
  security: [{ bearerAuth: [] }],
  summary: 'Get a program by public ID',
  description:
    'Requires a bearer access token. Looks up a program by its public display ID (e.g. PRG-1234).',
  request: { params: registeredProgramIdParamsSchema },
  responses: {
    200: {
      description: 'Program retrieved successfully.',
      content: { 'application/json': { schema: programResponseSchema } },
    },
    400: {
      description: 'programId path parameter is malformed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'Program not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/programs/{programId}',
  tags: ['Programs'],
  security: [{ bearerAuth: [] }],
  summary: 'Update a program',
  description:
    'Requires a bearer access token. Partially updates a program by public ID, including reassigning it to a different school; at least one field must be provided.',
  request: {
    params: registeredProgramIdParamsSchema,
    body: {
      required: true,
      content: {
        'application/json': { schema: registeredUpdateProgramSchema },
      },
    },
  },
  responses: {
    200: {
      description: 'Program updated successfully.',
      content: { 'application/json': { schema: programResponseSchema } },
    },
    400: {
      description: 'Request validation failed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'Program (or the reassigned school) was not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/schools/{schoolId}/programs',
  tags: ['Schools', 'Programs'],
  security: [{ bearerAuth: [] }],
  summary: "List a school's programs",
  description:
    'Requires a bearer access token. Returns a paginated, filterable list of programs offered by a specific school (identified by its public school ID).',
  request: {
    params: registeredSchoolIdParamsSchema,
    query: registeredListSchoolProgramsQuerySchema,
  },
  responses: {
    200: {
      description: "School's programs retrieved successfully.",
      content: { 'application/json': { schema: programListResponseSchema } },
    },
    400: {
      description: 'Path or query parameter validation failed.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    401: {
      description: 'Bearer token is missing or invalid.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
    404: {
      description: 'School not found.',
      content: { 'application/json': { schema: errorResponseSchema } },
    },
  },
})

// ==========================================
// APPLICATIONS & STUDENT STATUS HISTORY
// ==========================================

const errorContent = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorResponseSchema } },
})

const applicationStatusEnum = z.enum([
  'DRAFT',
  'DOCUMENTS_PENDING',
  'SUBMITTED',
  'OFFER_RECEIVED',
  'VISA_PROCESSING',
  'COMPLETED',
  'REJECTED',
  'WITHDRAWN',
])

const staffRefSchema = z.object({ publicId: z.string(), fullName: z.string() })

const applicationDataSchema = z.object({
  publicId: z.string(),
  status: applicationStatusEnum,
  student: z.object({
    publicId: z.string(),
    firstName: z.string(),
    lastName: z.string().nullable(),
  }),
  program: z.object({
    publicId: z.string(),
    name: z.string(),
    studyLevel: z.enum(['UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORATE', 'FOUNDATION']),
  }),
  school: z.object({
    publicId: z.string(),
    name: z.string(),
    country: z.string(),
  }),
  intake: z
    .object({
      month: z.string(),
      year: z.number(),
      applicationDeadline: z.date().nullable(),
    })
    .nullable(),
  externalReference: z.string().nullable(),
  notes: z.string().nullable(),
  createdBy: staffRefSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
})

const applicationHistoryEntrySchema = z.object({
  fromStatus: applicationStatusEnum.nullable(),
  toStatus: applicationStatusEnum,
  note: z.string().nullable(),
  changedBy: staffRefSchema.nullable(),
  changedAt: z.date(),
})

const paginationSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

const successEnvelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data,
    meta: z.object({ requestId: z.string() }),
  })

const applicationResponseSchema = registry.register(
  'ApplicationResponse',
  successEnvelope(applicationDataSchema),
)

const applicationDetailResponseSchema = registry.register(
  'ApplicationDetailResponse',
  successEnvelope(
    applicationDataSchema.extend({
      history: z.array(applicationHistoryEntrySchema),
    }),
  ),
)

const applicationListResponseSchema = registry.register(
  'ApplicationListResponse',
  successEnvelope(
    z.object({
      applications: z.array(applicationDataSchema),
      summary: z.record(applicationStatusEnum, z.number()),
      pagination: paginationSchema,
    }),
  ),
)

const studentApplicationListResponseSchema = registry.register(
  'StudentApplicationListResponse',
  successEnvelope(
    z.object({
      applications: z.array(applicationDataSchema),
      pagination: paginationSchema,
    }),
  ),
)

const studentStatusHistoryResponseSchema = registry.register(
  'StudentStatusHistoryResponse',
  successEnvelope(
    z.array(
      z.object({
        fromStatus: z.string().nullable(),
        toStatus: z.string(),
        source: z.enum([
          'LEAD_CREATED',
          'MANUAL',
          'ADVISOR_ASSIGNED',
          'ADVISOR_UNASSIGNED',
          'FOLLOW_UP_CREATED',
          'APPLICATION_CREATED',
        ]),
        note: z.string().nullable(),
        changedBy: staffRefSchema.nullable(),
        changedAt: z.date(),
      }),
    ),
  ),
)

const registeredStudentIdParamsSchema = registry.register(
  'StudentIdParams',
  StudentsSchemas.studentIdParamsSchema,
)
const registeredApplicationIdParamsSchema = registry.register(
  'ApplicationIdParams',
  ApplicationsSchemas.applicationIdParamsSchema,
)
const registeredCreateApplicationSchema = registry.register(
  'CreateApplicationRequest',
  ApplicationsSchemas.createApplicationSchema,
)
const registeredUpdateApplicationSchema = registry.register(
  'UpdateApplicationRequest',
  ApplicationsSchemas.updateApplicationSchema,
)
const registeredUpdateApplicationStatusSchema = registry.register(
  'UpdateApplicationStatusRequest',
  ApplicationsSchemas.updateStatusSchema,
)
const registeredListApplicationsQuerySchema = registry.register(
  'ListApplicationsQuery',
  ApplicationsSchemas.listApplicationsQuerySchema,
)
const registeredListStudentApplicationsQuerySchema = registry.register(
  'ListStudentApplicationsQuery',
  ApplicationsSchemas.listStudentApplicationsQuerySchema,
)

const ROLE_NOTE =
  'Allowed roles: ADMIN (any student) and ADVISOR (assigned students only — enforced server-side; client-sent advisor IDs are never trusted).'

registry.registerPath({
  method: 'get',
  path: '/api/v1/students/{studentId}/applications',
  tags: ['Applications'],
  security: [{ bearerAuth: [] }],
  summary: "List a student's applications",
  description: `Requires a bearer access token. ${ROLE_NOTE} Newest first, optionally filtered by status.`,
  request: {
    params: registeredStudentIdParamsSchema,
    query: registeredListStudentApplicationsQuerySchema,
  },
  responses: {
    200: {
      description: 'Applications retrieved successfully.',
      content: { 'application/json': { schema: studentApplicationListResponseSchema } },
    },
    400: errorContent('Path or query parameter validation failed.'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent('Role not allowed, or the student is not assigned to this advisor.'),
    404: errorContent('Student not found.'),
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/students/{studentId}/applications',
  tags: ['Applications'],
  security: [{ bearerAuth: [] }],
  summary: 'Create an application for a student',
  description: `Requires a bearer access token. ${ROLE_NOTE} Creates a DRAFT application for a program. intakeMonth and intakeYear must be sent together and must match one of the program's stored intakes. If the student is ASSIGNED or FOLLOW_UP they are moved to APPLICATION_STARTED (never moved backwards), and both changes are recorded in status history.`,
  request: {
    params: registeredStudentIdParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: registeredCreateApplicationSchema } },
    },
  },
  responses: {
    201: {
      description: 'Application created successfully.',
      content: { 'application/json': { schema: applicationResponseSchema } },
    },
    400: errorContent('Validation failed, or the intake is not a listed intake for the program.'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent('Role not allowed, or the student is not assigned to this advisor.'),
    404: errorContent('Student or program not found.'),
    409: errorContent('The student already has an open application for this program.'),
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/applications',
  tags: ['Applications'],
  security: [{ bearerAuth: [] }],
  summary: 'List applications across students',
  description: `Requires a bearer access token. ${ROLE_NOTE} ADVISOR results are always limited to their own students (advisorId is ignored); ADMIN may filter by a public advisorId. search matches the application ID, student ID/name, and program name. summary counts every status within the same advisor/search scope, ignoring the status filter.`,
  request: { query: registeredListApplicationsQuerySchema },
  responses: {
    200: {
      description: 'Applications retrieved successfully.',
      content: { 'application/json': { schema: applicationListResponseSchema } },
    },
    400: errorContent('Query parameter validation failed.'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent('Role not allowed.'),
    404: errorContent('The advisor referenced by the advisorId filter was not found.'),
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/applications/{applicationId}',
  tags: ['Applications'],
  security: [{ bearerAuth: [] }],
  summary: 'Get an application with its status history',
  description: `Requires a bearer access token. ${ROLE_NOTE} history is oldest first; the first entry (fromStatus null) is the creation.`,
  request: { params: registeredApplicationIdParamsSchema },
  responses: {
    200: {
      description: 'Application retrieved successfully.',
      content: { 'application/json': { schema: applicationDetailResponseSchema } },
    },
    400: errorContent('applicationId path parameter is malformed.'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent("Role not allowed, or the application's student is not assigned to this advisor."),
    404: errorContent('Application not found.'),
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/applications/{applicationId}',
  tags: ['Applications'],
  security: [{ bearerAuth: [] }],
  summary: 'Update application details',
  description: `Requires a bearer access token. ${ROLE_NOTE} Updates intake, externalReference, or notes (null clears a field). Final applications (COMPLETED, REJECTED, WITHDRAWN) cannot be edited.`,
  request: {
    params: registeredApplicationIdParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: registeredUpdateApplicationSchema } },
    },
  },
  responses: {
    200: {
      description: 'Application updated successfully.',
      content: { 'application/json': { schema: applicationResponseSchema } },
    },
    400: errorContent('Validation failed, or the intake is not a listed intake for the program.'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent("Role not allowed, or the application's student is not assigned to this advisor."),
    404: errorContent('Application not found.'),
    409: errorContent('The application is final and can no longer be edited.'),
  },
})

registry.registerPath({
  method: 'patch',
  path: '/api/v1/applications/{applicationId}/status',
  tags: ['Applications'],
  security: [{ bearerAuth: [] }],
  summary: 'Change application status',
  description: `Requires a bearer access token. ${ROLE_NOTE} Forward-only along DRAFT → DOCUMENTS_PENDING → SUBMITTED → OFFER_RECEIVED → VISA_PROCESSING → COMPLETED (skipping forward is allowed). REJECTED and WITHDRAWN are allowed from any open status. COMPLETED, REJECTED, and WITHDRAWN are final. Each change appends a status history entry with the optional note.`,
  request: {
    params: registeredApplicationIdParamsSchema,
    body: {
      required: true,
      content: { 'application/json': { schema: registeredUpdateApplicationStatusSchema } },
    },
  },
  responses: {
    200: {
      description: 'Application status updated successfully.',
      content: { 'application/json': { schema: applicationResponseSchema } },
    },
    400: errorContent('Request validation failed.'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent("Role not allowed, or the application's student is not assigned to this advisor."),
    404: errorContent('Application not found.'),
    409: errorContent('Transition not allowed, or the status changed since it was loaded.'),
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/students/{studentId}/status-history',
  tags: ['Students'],
  security: [{ bearerAuth: [] }],
  summary: "Get a student's status history",
  description: `Requires a bearer access token. ${ROLE_NOTE} Newest first. changedBy is null for system changes (e.g. a lead created from Telegram). History starts from when this feature shipped; earlier changes were not recorded.`,
  request: { params: registeredStudentIdParamsSchema },
  responses: {
    200: {
      description: 'Student status history retrieved successfully.',
      content: { 'application/json': { schema: studentStatusHistoryResponseSchema } },
    },
    400: errorContent('studentId path parameter is malformed.'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent('Role not allowed, or the student is not assigned to this advisor.'),
    404: errorContent('Student not found.'),
  },
})

// ==========================================
// AUDIT LOGS
// ==========================================

const auditLogListResponseSchema = registry.register(
  'AuditLogListResponse',
  successEnvelope(
    z.object({
      logs: z.array(
        z.object({
          id: z.string(),
          action: z.enum(AUDIT_ACTION_VALUES),
          entity: z.object({
            type: z.enum(AUDIT_ENTITY_TYPES),
            id: z.string().nullable(),
          }),
          actor: z
            .object({
              publicId: z.string(),
              fullName: z.string(),
              role: z.enum(['ADMIN', 'ADVISOR', 'OPERATIONS']).nullable(),
            })
            .nullable(),
          before: z.unknown().nullable(),
          after: z.unknown().nullable(),
          metadata: z.unknown().nullable(),
          requestId: z.string().nullable(),
          ipAddress: z.string().nullable(),
          userAgent: z.string().nullable(),
          createdAt: z.date(),
        }),
      ),
      pagination: paginationSchema,
    }),
  ),
)

const registeredListAuditLogsQuerySchema = registry.register(
  'ListAuditLogsQuery',
  AuditSchemas.listAuditLogsQuerySchema,
)

registry.registerPath({
  method: 'get',
  path: '/api/v1/audit-logs',
  tags: ['Audit'],
  security: [{ bearerAuth: [] }],
  summary: 'List audit log entries',
  description:
    'Requires a bearer access token. Allowed roles: ADMIN only. Append-only record of who changed business data: login failures, session revocations, invitations, team member changes, advisor assignment, student/application status changes, school/program changes, settings, and recommendation weights. Newest first. before/after are sanitized snapshots (never passwords, tokens, or hashes). actor is null for system or unauthenticated actions (e.g. failed logins). actorId filters by the public USR- id.',
  request: { query: registeredListAuditLogsQuerySchema },
  responses: {
    200: {
      description: 'Audit log entries retrieved successfully.',
      content: { 'application/json': { schema: auditLogListResponseSchema } },
    },
    400: errorContent('Query parameter validation failed (e.g. unknown action, or `from` after `to`).'),
    401: errorContent('Bearer token is missing or invalid.'),
    403: errorContent('Only ADMIN may read audit logs.'),
    404: errorContent('The user referenced by the actorId filter was not found.'),
  },
})

// ==========================================
// HEALTH
// ==========================================

registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  summary: 'Liveness probe',
  description:
    'Public. Returns 200 while the Node process is up and serving requests. Checks no dependencies, so a database outage never marks the process as dead.',
  responses: {
    200: {
      description: 'The process is live.',
      content: {
        'application/json': {
          schema: successEnvelope(z.object({ status: z.literal('ok') })),
        },
      },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['Health'],
  summary: 'Readiness probe',
  description:
    'Public. Returns 200 when PostgreSQL answers a trivial query within 2 seconds, otherwise 503 with code SERVICE_UNAVAILABLE. Connection details are never exposed.',
  responses: {
    200: {
      description: 'The service can reach its database.',
      content: {
        'application/json': {
          schema: successEnvelope(
            z.object({
              status: z.literal('ready'),
              checks: z.object({ database: z.literal('up') }),
            }),
          ),
        },
      },
    },
    503: errorContent('The database is unreachable or did not answer in time.'),
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
