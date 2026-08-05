# School Finder Backend — Progress Log

This file is the running implementation log. Static project reference is in `AGENTS.md`.

---

## Current Implementation Notes

### Auth Login

- `POST /api/v1/auth/login` validates the request body with `loginSchema`.
- Login returns `200` with `{ success, message, data, meta.requestId }`.
- The response data includes a short-lived access token and the public staff user shape:
  `publicId`, `fullName`, `email`, `role`, and `status`.
- The refresh token is an opaque random token sent only in the `refreshToken`
  HttpOnly cookie. Only its SHA-256 hash is stored in `auth_sessions`.
- Login failures use the generic `INVALID_CREDENTIALS` response for missing users,
  missing password hashes, and wrong passwords.
- Disabled or non-active accounts are rejected with `ACCOUNT_DISABLED`.
- Successful login creates an auth session and updates `users.last_login_at`.

### Auth Refresh

- `POST /api/v1/auth/refresh` reads the opaque token from the `refreshToken`
  cookie only; clients should not send the refresh token in the JSON body.
- The refresh cookie value is validated with `refreshTokenSchema` before the
  service runs. Missing or malformed cookies return `400` with `UNAUTHORIZED`.
- The service hashes the incoming token and looks up the unique stored
  `auth_sessions.refresh_token_hash`.
- Valid refresh rotates the refresh token in place by replacing the current
  session row's `refresh_token_hash`, updating `last_used_at`, setting a new
  HttpOnly cookie, and returning `{ accessToken }`.
- The same auth session ID remains the session ID embedded in the returned
  access token. A new auth session row is not created for every access-token
  refresh.
- Expired sessions and client fingerprint mismatch revoke the current
  `auth_sessions` row only. Already-revoked sessions are rejected without another
  revoke write.
- Refresh rejects missing, expired, revoked, inactive-account, and client
  fingerprint mismatch cases with stable error codes:
  `AUTH_SESSION_NOT_FOUND`, `AUTH_SESSION_EXPIRED`, `AUTH_SESSION_REVOKED`,
  `ACCOUNT_DISABLED`, and `AUTH_SESSION_DEVICE_MISMATCH`.

### Auth Logout and Current User

- `AuthenticateMiddleware` validates the `Authorization: Bearer <token>` access
  token, checks the user and auth session in the database, and stores decoded
  claims on `req.auth`. It must not overwrite `req.body`, because cookie
  validation merges the refresh token there for refresh/logout flows.
- Protected auth routes reject missing users, inactive users, stale
  `token_version`, missing sessions, revoked sessions, and expired sessions
  before reaching the controller. This gives logout/logout-all immediate effect
  for bearer-token protected routes instead of waiting for the 15-minute access
  token expiry.
- `POST /api/v1/auth/logout` requires both a bearer access token and the
  `refreshToken` HttpOnly cookie. The service hashes the cookie token, verifies
  the stored session belongs to the access-token subject and session ID, revokes
  only that session row, and clears the refresh cookie.
- `POST /api/v1/auth/logout-all` requires both a bearer access token and the
  `refreshToken` HttpOnly cookie. After confirming the cookie session belongs to
  the authenticated user, it revokes all active auth sessions by `user_id` and
  clears the refresh cookie.
- `GET /api/v1/auth/me` requires a bearer access token and returns safe staff
  user fields only. It must not expose `id`, `password_hash`, `token_version`, or
  password-reset metadata.
- `PATCH /api/v1/auth/me` requires a bearer access token and accepts only
  `fullName` and `phone`. At least one field is required. The endpoint updates
  the authenticated user's own profile and returns the same safe staff user shape
  as `GET /api/v1/auth/me`. It does not allow self-service edits to `email`,
  `role`, `status`, password fields, token metadata, or internal IDs.

### Auth Change Password

- `POST /api/v1/auth/change-password` requires a bearer access token and accepts
  `currentPassword`, `newPassword`, and `confirmNewPassword`.
- The request schema enforces the password policy for the new password without
  trimming password values. The service repeats the policy and confirmation
  checks so direct service calls cannot bypass boundary validation.
- The current password is verified against the stored Argon2 hash. Missing users,
  missing password hashes, and wrong current passwords return the generic
  `INVALID_CREDENTIALS` response.
- The new password must differ from the current password.
- On success, the repository performs the password update and session changes in
  one transaction: update `users.password_hash`, increment `users.token_version`,
  set `password_changed_at`, revoke every other active `auth_sessions` row for
  the user, and rotate the current session's refresh-token hash.
- The response sets a rotated `refreshToken` HttpOnly cookie and returns a fresh
  access token with the incremented token version plus the safe staff user shape.

### Auth Forgot Password

- `POST /api/v1/auth/forgot-password` is public and accepts only `email`.
- The endpoint always returns `200` with a generic success message so callers
  cannot discover whether an account exists.
- The service lowercases and trims the email before lookup. Missing users,
  invited users, and disabled users do not receive reset tokens or emails.
- For active users, the service generates a random opaque reset token, stores
  only its SHA-256 hash in `password_reset_tokens`, expires previous unused reset
  tokens for that user, and sets a one-hour expiry.
- The raw reset token is sent only inside the frontend reset URL:
  `${FRONTEND_URL}/reset-password/:token`.
- Email is sent directly through the Nodemailer email provider for now. SMTP is
  used when configured; development/test can use the JSON transport fallback.
  Do not add Redis/BullMQ until there is a real retry/delay workflow.
- The password-reset email template follows `contextF.md`: brand color
  `#045A58`, hover/dark accent `#034A48`, light brand panel `#E6F4F3`, neutral
  page background `#F5F6F8`, white surface, subtle borders, concise operational
  copy, and no decorative marketing layout.
- Email delivery failures are logged internally with user ID and expiry metadata,
  but token values and reset URLs are not logged and the HTTP response remains
  generic.

### Auth Verify Reset Password Token

- `GET /api/v1/auth/reset-password/:token` is public and validates the reset
  token from the frontend reset link before the reset form is rendered.
- The route validates that `:token` is a 128-character opaque hex token. Malformed
  token path parameters return `400` with `VALIDATION_ERROR` before service work.
- The service hashes the raw token with SHA-256 and looks up
  `password_reset_tokens.token_hash`; raw tokens are never stored or logged.
- Missing and already-used reset tokens return `401` with `TOKEN_INVALID`.
  Expired reset tokens return `401` with `TOKEN_EXPIRED`.
- Reset tokens whose user is no longer `ACTIVE` return `403` with
  `ACCOUNT_DISABLED`.
- A valid token returns only the minimal public state needed by the frontend:
  `email` and `fullName`. It does not expose token IDs, token hashes, internal
  user IDs, account status, expiration internals, password hashes, token version,
  or session metadata.
- Successful token verification writes a structured internal log with user ID,
  reset-token row ID, and expiry timestamp. Request logging redacts
  `/api/v1/auth/reset-password/:token` URL segments as
  `/api/v1/auth/reset-password/[REDACTED]`.

### Auth Reset Password

- `POST /api/v1/auth/reset-password/:token` is public and accepts
  `newPassword` and `confirmNewPassword`.
- The route validates that `:token` is a 128-character opaque hex token and that
  the replacement password satisfies the same policy used by change-password:
  at least 8 characters with uppercase, lowercase, and number characters.
- The service repeats password confirmation and policy checks so direct service
  calls cannot bypass boundary validation.
- The service hashes the raw reset token with SHA-256 before lookup. Missing and
  already-used reset tokens return `401` with `TOKEN_INVALID`; expired tokens
  return `401` with `TOKEN_EXPIRED`; tokens for inactive users return `403` with
  `ACCOUNT_DISABLED`.
- Reset password rejects reusing the current password when the active user has an
  existing password hash.
- On success, the repository transaction consumes the reset token, updates
  `users.password_hash`, increments `users.token_version`, sets
  `password_changed_at`, and revokes all active `auth_sessions` rows for the
  user.
- The response clears the `refreshToken` cookie if present and returns an empty
  success response. It does not return an access token, refresh token, password
  hash, token hash, token ID, session data, or internal user ID.
- Successful password reset writes a structured internal log with user ID,
  reset-token row ID, and password-change timestamp. Raw tokens, reset URLs, and
  password values are not logged.

### Documentation and Logs

- Development documentation is available at `GET /openapi.json` and `GET /docs`
  when `DOCS_ENABLED=true`. It is disabled by default in production.
- The login, forgot-password, reset-password token verification, reset-password,
  edit-profile, and change-password OpenAPI entries are generated from the same
  Zod request schemas used by runtime validation. Refresh, logout, logout-all,
  and auth/me are documented with their cookie and bearer-token requirements.
- `pino-http` records structured request logs with request IDs and redacts
  authorization headers, cookies, passwords, change-password fields, refresh
  tokens, reset-password URL tokens, and set-cookie response headers.
- Unexpected server errors are logged once by the global error handler.

### Auth Tests

- `tests/auth.service.test.ts` covers login business behavior without requiring
  a live database.
- `tests/auth.http.test.ts` uses Supertest against the Express app without
  opening a network port.
- Current auth coverage includes successful login, refresh-token hashing,
  generic credential failures, inactive-account rejection, refresh rotation,
  expired/revoked/missing refresh sessions, client fingerprint mismatch, current
  session logout, logout-all by authenticated `user_id`, `/auth/me`,
  `PATCH /auth/me`, `POST /auth/change-password`,
  `POST /auth/forgot-password`, `GET /auth/reset-password/:token`,
  `POST /auth/reset-password/:token`, revoked-session rejection before protected
  route handlers, cookie shape, bearer-token requirements, and validation errors.

---

## Next Auth Work

- Implement the remaining auth routes in this order:
  1. `GET /api/v1/auth/invitations/:token`: validate a pending invitation token
     without exposing raw token data, expiration internals, password hashes, or
     unrelated user fields.
  2. `POST /api/v1/auth/invitations/:token/accept`: validate the token, set the
     invited user's password, move the account to `ACTIVE`, consume the
     invitation token, create any default notification preferences, and return
     login-equivalent session output if the product wants immediate sign-in.
- Invitation-token repository work is still pending.
- Add rate limits for login, forgot-password, reset-password, and invitation
  acceptance before exposing these flows outside development.
- Consider renaming `generateAcessToken`, `decodeAcessToken`, and the
  `session_Id` JWT claim after current auth behavior is stable. Keep backward
  compatibility in mind if live tokens already exist.
- Add database/integration tests for repository methods once a disposable test
  database is available in CI.

---

## Team Module Implementation Notes

### Routes implemented

All 7 routes from the AGENTS.md spec are now wired up:

```
GET    /api/v1/team                                   — list all team members
POST   /api/v1/team/invitations                       — create invitation (Admin)
POST   /api/v1/team/invitations/:invitationId/resend  — resend invitation (Admin)
DELETE /api/v1/team/invitations/:invitationId         — cancel invitation (Admin)
GET    /api/v1/team/:userId                           — get one member (by public_id)
PATCH  /api/v1/team/:userId                           — update member name/phone
PATCH  /api/v1/team/:userId/status                    — change member status
```

### Bugs fixed from original implementation

1. **Silent success suppression** (`team.service.ts`): The success `return` block was
   inside the `catch` block of the email try/catch. If email succeeded, the function
   returned `undefined`. Fixed: `return` is now outside the try/catch, always reached.

2. **`expiresInMinutes` received a `Date` not a number** (`team.service.ts` +
   `team.types.ts`): `buildInviteEmail` was passed `invite.expires_at` (a `Date` object)
   as `expiresInMinutes`. The email template called `.toString()` on it and rendered a
   full ISO date string. Fixed: the constant `INVITATION_TTL_MINUTES = 60` is passed
   instead; `InviteEmailData.expiresInMinutes` is now typed `number`.

3. **`send_count` field name mismatch** (`team.repository.ts`): The Prisma update wrote
   to `sent_count` but the schema field is `send_count`. This would throw a Prisma
   runtime error or silently no-op. Fixed.

4. **Untrimmed email sent to email provider** (`team.service.ts`): The raw
   `invitationData.email` was passed to `buildInviteEmail` instead of the trimmed and
   lowercased `email` variable. Fixed.

5. **Middleware order** (`team.routes.ts`): `validate` ran before `AuthenticateMiddleware`
   on `POST /invitations`. Fixed: `AuthenticateMiddleware` is now always first on every
   route so unauthenticated requests are rejected before body parsing.

6. **Empty stale-expiry block** (`team.service.ts`): `if (invitation.expires_at > new
Date()) { }` did nothing and was removed.

7. **Redundant auth re-query in service**: The service was re-fetching and re-checking
   `user.status !== 'ACTIVE' || user.role !== 'ADMIN'` after the middleware had already
   done those checks. Role enforcement (Admin-only) is now checked via `auth.role` from
   the JWT claims in the service without a DB round-trip. Status is fully owned by the
   middleware.

8. **No duplicate email guard**: Creating a user with an existing email would throw a raw
   Prisma unique-constraint error instead of a clean `CONFLICT` AppError. Fixed: a
   `findUser({ email })` check runs before `CreateInviteUser`.

9. **Missing `DELETE /invitations/:id`** (`team.routes.ts`): The cancel route was entirely
   absent. Implemented `CancelInvitation` in service, repository, controller, and routes.

10. **Missing `GET /team`, `GET /team/:userId`, `PATCH /team/:userId`, `PATCH
/team/:userId/status`**: All four were missing from routes, controller, and service.
    Implemented fully.

11. **Redundant `.refine()` in `invitationSchema`**: The refine checking `fullName &&
email` was unreachable — Zod's `.min(2)` and `.email()` reject those cases first.
    Removed.

12. **`findFirst` vs `findUnique` on invitation id**: `FindTeamInvitation` used
    `findFirst` when `id` is a unique PK — replaced with `findInvitationById` using
    `findUnique` for a guaranteed single-row lookup.

### Repository methods added

- `findInvitationById(id)` — `findUnique` on invitation PK, includes `user`
- `CancelInvitation(id)` — sets `canceled_at = now()`
- `findAllUsers()` — returns all users ordered by `created_at desc`
- `findUserByPublicId(publicId)` — lookup by `public_id` column
- `updateUser(id, data)` — partial update for `full_name` and `phone`
- `updateUserStatus(id, status)` — targeted status write

### Schema additions

- `updateMemberSchema` — validates `PATCH /team/:userId` body; `.refine()` ensures at
  least one field (fullName or phone) is present.
- `updateStatusSchema` — validates `PATCH /team/:userId/status`; only accepts `ACTIVE`
  or `DISABLED`.

### Controller changes

- `POST /invitations` now returns `201` (was incorrectly `200`).
- `res.send()` changed to `res.json()` for consistency across all handlers.

### Email

- Invitation email sends `expiresInMinutes: INVITATION_TTL_MINUTES` (number) rather
  than the raw `expires_at` Date. Template now correctly renders e.g. "expires in 60
  minutes".
- The inviter name is fetched from the DB using `auth.sub` (already validated by
  middleware) rather than from a redundant second `findUser` call on the full user
  object inside the role-check block.
- Email failures are logged with `userId` and `invitationExpiresAt` but never surface
  to the HTTP caller — the invitation was already persisted.

### Tests (`tests/team.http.test.ts`)

HTTP tests (via Supertest, no real port):

- `POST /invitations`: success 201, duplicate email 409, missing fields 400, bad email
  400, invalid role 400, no auth 401, email normalisation assertion.
- `POST /invitations/:id/resend`: success 200, not found 404, already accepted 409,
  already canceled 409, no auth 401.
- `DELETE /invitations/:id`: success 200, not found 404, already accepted 409, already
  canceled 409, no auth 401.
- `GET /team`: success 200 with array, empty list 200, no auth 401.
- `GET /team/:userId`: success 200, not found 404, no auth 401.
- `PATCH /team/:userId`: success 200, empty body 400, not found 404, no auth 401.
- `PATCH /team/:userId/status`: success 200, same status 409, invalid status 400, not
  found 404, no auth 401.

Service unit tests (no HTTP):

- `Invitation`: CONFLICT on duplicate email, email normalisation verified at repo call.
- `ResendInvitation`: NOT_FOUND, ALREADY_ACCEPTED, CANCELED, send_count increment.
- `CancelInvitation`: repo called with correct id, NOT_FOUND.
- `GetMember`: NOT_FOUND, safe field stripping (no id, password_hash, token_version).
- `UpdateMemberStatus`: CONFLICT when status unchanged.

## Next Team Work

- Add `authorize` middleware (or a service-layer role guard helper) to enforce Admin-only
  access on write routes instead of relying on the caller's JWT `role` claim without a
  DB verification. For now, `AuthenticateMiddleware` validates the token and session;
  role is taken from `auth.role`.
- Add rate limiting on `POST /invitations` and `POST /invitations/:id/resend`.
- Add pagination to `GET /team` once member list grows.

---

## Auth Invitation Acceptance & Verification

### Routes implemented

```
GET  /api/v1/auth/invitations/:token         — verify a pending invitation token (public)
POST /api/v1/auth/invitations/:token/accept  — accept invitation and set password (public)
```

### Improvements & Bug Fixes

1. **Route Alignment**: The POST route was previously defined at `/invitations/:token` in `auth.routes.ts` instead of the specified `/invitations/:token/accept`. Corrected.
2. **Activation Bug**: Accepting the invitation previously only updated the password hash but left the user status as `INVITED`. Corrected: `UpdateInvitationAndUserPassword` now updates status to `ACTIVE` as well, enabling successful user login.
3. **Consistency**: Changed returned payload key from `name` to `fullName` in `VerifyInvitationToken` service to match standard naming conventions.
4. **Documentation**: Added complete OpenAPI 3.1 path parameters, request bodies, and success/error responses for both endpoints in `src/config/openapi.ts`.
5. **Testing**:
   - Added HTTP integration tests in `tests/auth.http.test.ts` verifying validation errors, malformed tokens, valid token verification, and successful password reset.
   - Added unit tests in `tests/auth.service.test.ts` for `VerifyInvitationToken` and `ResetPasswordFromInvitation` covering validation, already-consumed tokens, and token expiry.
6. **Code Quality**: Checked typecheck, ESLint, and Prettier formatting across the entire workspace (all passing successfully with zero warnings/errors).
