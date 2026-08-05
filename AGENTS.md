# School Finder Backend — Agent Reference

## Project Overview

Backend for the School Finder AI internal operations platform and its student-facing Telegram workflow.

Supports: Admin/Advisor/Operations accounts, team invitations, authentication, password recovery, sessions, student leads (Telegram or manual), advisor assignment/capacity/notes/follow-ups/workflow, schools/programs/intakes/requirements, Telegram conversations/AI summaries/advisor replies, school recommendations/scoring/comparison/shortlists, notifications, audit history, dashboard metrics, and operational reporting.

- **Internal staff interface**: React frontend.
- **Student-facing interface**: Telegram (primary).

---

## Backend Principles

1. Authorization enforced by backend, never by hidden frontend controls.
2. Advisors access only assigned students unless Admin grants broader permission.
3. Status and access changes create immutable history/audit records.
4. Passwords, invitation tokens, reset tokens, and refresh tokens are never stored in plain text.
5. API input validated at the application boundary.
6. Database constraints protect data even when application validation fails.
7. Controllers stay thin; business rules belong in services.
8. Slow or retryable work runs in background jobs.
9. API responses and errors use consistent structures.
10. Modular monolith — no microservices in first implementation.

---

## Stack

| Layer                                       | Choice                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| Runtime                                     | Node.js (Active LTS), TypeScript strict                                 |
| HTTP                                        | Express 5                                                               |
| Database                                    | PostgreSQL + Prisma ORM + `@prisma/adapter-pg`                          |
| Validation                                  | Zod (env, requests, responses)                                          |
| Auth                                        | `argon2` (Argon2id), `jsonwebtoken` (15 min JWTs), `cookie-parser`      |
| Security                                    | `helmet`, `cors` (explicit origin), `express-rate-limit`                |
| Logging                                     | `pino` + `pino-http`, `compression`, `nodemailer`                       |
| API docs                                    | OpenAPI 3.1 via `@asteasolutions/zod-to-openapi` + `swagger-ui-express` |
| Testing                                     | Vitest, Supertest, ESLint (`typescript-eslint`), Prettier               |
| AI                                          | Provider-agnostic interface — `src/integrations/ai/ai.provider.ts`      |
| Background _(add when first queue exists)_  | Redis, BullMQ, `ioredis`                                                |
| Telegram _(add when Telegram work begins)_  | `grammy` or thin HTTP wrapper → `src/integrations/telegram`             |
| Files _(add when document workflows begin)_ | `multer`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`         |

AI provider contract:

```ts
interface AiProvider {
  summarizeConversation(
    messages: ConversationMessage[],
  ): Promise<ConversationSummary>
  extractStudentPreferences(
    messages: ConversationMessage[],
  ): Promise<ExtractedPreferences>
}
```

Start scoring with deterministic rules. Add LLM only for extraction, summaries, or explanations with measurable value. Do not let an LLM invent tuition, deadlines, or admission requirements — those come from stored records only.

---

## Environment Variables

Rules:

- Commit `.env.example`; never commit `.env`.
- Validate every variable at startup with Zod; fail fast on invalid config.
- Seed-only vars (`SEED_ADMIN_*`) validated inside `prisma/seed.ts` only — normal startup must not depend on them.
- Production secrets come from the deployment platform's secret manager.
- Never log values that contain secrets.
- See `.env.example` for the full variable list.

---

## Folder Structure

```
src/
  server.ts / app.ts         # entry point + Express setup (middleware, routes)
  config/                    # env.ts, auth.ts, logger.ts, openapi.ts
  database/                  # prisma.ts (client + adapter), transaction.ts
  middleware/                # authenticate, authorize, validate, rateLimit,
                             #   requestId, notFound, errorHandler
  common/                    # errors/ (AppError, errorCodes)
                             # http/ (response, pagination)
                             # security/ (password, tokens, tokenHash)
                             # utils/ (dates, pagination)
  modules/                   # one folder per domain:
                             #   auth · users · team · advisors · students · followUps
                             #   schools · programs · applications · conversations
                             #   recommendations · notifications · settings · dashboard · audit
                             # each: routes · controller · service · repository · schemas · types
  integrations/              # email/ · telegram/ · ai/
  jobs/                      # queues.ts + workers/ (email, followUpReminder, telegram, recommendation)
  docs/                      # registry.ts, document.ts (OpenAPI builder)

prisma/                      # schema.prisma · seed.ts · migrations/
tests/                       # setup.ts · factories/ · unit/ · integration/ · e2e/
```

Route prefixes: `/health/live`, `/health/ready`, `/docs`, `/openapi.json`, `/api/v1/...`

---

## Standard API Responses

**Success:**

```json
{ "data": {}, "meta": { "requestId": "req_..." } }
```

**Paginated:**

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 248,
    "pageCount": 13,
    "requestId": "req_..."
  }
}
```

**Error:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": { "email": ["..."] },
    "requestId": "req_..."
  }
}
```

Never return stack traces, SQL errors, token values, or password information to clients.

---

## Authentication Design

### Passwords

- Hash with Argon2id. Never log passwords. Policy enforced in Zod and service.
- Password changes revoke other refresh sessions.

### Access Tokens

- Short-lived JWT (10–15 min). Claims: `sub`, role, session ID, token version. No private profile data.

### Refresh Sessions

- Cryptographically random refresh token; store only SHA-256 hash in `auth_sessions`.
- Send raw token in `HttpOnly`, `Secure`, `SameSite=Lax` cookie. Rotate on refresh.
- Revoke token family on reuse detection.

### Invitations & Password Resets

- Opaque tokens via `crypto.randomBytes`. Store only hashes. Single-use, time-limited.
- Invitation acceptance: `INVITED` → `ACTIVE`.
- Forgot-password response must not reveal whether email exists.

### Logout

- Revoke current session in PostgreSQL. Clear refresh cookie. Access tokens expire naturally.

---

## Authorization Model

### Roles

`ADMIN` | `ADVISOR` | `OPERATIONS`

### Baseline Access

| Capability               | Admin | Advisor       | Operations        |
| ------------------------ | ----- | ------------- | ----------------- |
| Manage team accounts     | Yes   | No            | No                |
| View all students        | Yes   | No            | Configurable      |
| View assigned students   | Yes   | Yes           | Supporting access |
| Assign/reassign advisors | Yes   | No by default | Optional          |
| Manage conversations     | Yes   | Assigned only | No by default     |
| Create notes/follow-ups  | Yes   | Assigned only | Optional          |
| Review recommendations   | Yes   | Assigned only | Supporting access |
| Manage schools/programs  | Yes   | Read          | Yes               |
| Manage settings          | Yes   | No            | No by default     |
| View advisor workload    | Yes   | Own summary   | Supporting read   |

### Ownership Rule

Advisor accessing `/students/:id` must satisfy: `student.assignedAdvisor.userId === authenticatedUser.id`

Applies to: student notes, follow-ups, applications, conversations, recommendations, shortlists. Never trust `advisorId` sent by the client.

### Permissions

Start with role permissions in code. Add DB-managed per-person overrides only when genuinely needed.

---

## Database Conventions

- PostgreSQL UUID primary keys generated by the database.
- Public display IDs (`STU-1048`, `SCH-2048`, `PRG-3108`) are separate unique columns.
- Timestamps as `timestamptz` in UTC; use `created_at`, `updated_at`, `deleted_at` (soft-delete).
- `numeric` (not float) for money and scores. Normalize emails to lowercase with unique index.
- Database enums for stable system states; setting tables for admin-configurable values.
- Indexes on every common FK, filter, and sort column.

---

## Core Enums

```
UserRole:            ADMIN | ADVISOR | OPERATIONS
UserStatus:          INVITED | ACTIVE | DISABLED
AdvisorAvailability: AVAILABLE | LIMITED | UNAVAILABLE
StudentSource:       TELEGRAM | FACEBOOK | INSTAGRAM | WEBSITE | WHATSAPP | PHONE_CALL |
                     WALK_IN | REFERRAL | EDUCATION_FAIR | SPREADSHEET_IMPORT | OTHER
StudentStatus:       NEW | AWAITING_ASSIGNMENT | ASSIGNED | FOLLOW_UP |
                     APPLICATION_STARTED | COMPLETED | CLOSED
FollowUpPriority:    NORMAL | HIGH | URGENT
FollowUpStatus:      PENDING | COMPLETED | CANCELED | OVERDUE
ConversationStatus:  ACTIVE | ESCALATED | RESOLVED
MessageSender:       STUDENT | AGENT | ADVISOR | SYSTEM
SchoolStatus:        ACTIVE | INACTIVE
PartnerStatus:       PARTNER | PROSPECT | NON_PARTNER
ApplicationStatus:   DRAFT | DOCUMENTS_PENDING | SUBMITTED | OFFER_RECEIVED |
                     VISA_PROCESSING | COMPLETED | REJECTED | WITHDRAWN
NotificationType:    ASSIGNMENT | CONVERSATION | FOLLOW_UP | RECOMMENDATION | TEAM | SYSTEM
```

---

## Database Schema

Source of truth: `prisma/schema.prisma`. The table below captures non-obvious rules not visible from column names alone.

| Table                           | Non-obvious rule                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users`                         | `token_version` (int, default 0) incremented on password change — invalidates all existing JWTs immediately   |
| `auth_sessions`                 | `token_family` (uuid) groups a rotated token chain; reuse of any superseded member revokes the entire family  |
| `team_invitations`              | Unique constraint on `user_id` covers active (non-accepted, non-canceled) invitations only                    |
| `advisor_profiles`              | Active workload is derived from assigned non-closed students — never store a redundant `active_student_count` |
| `advisor_specializations`       | Composite PK `(advisor_id, specialization_id)`                                                                |
| `students`                      | Compound indexes: `(assigned_advisor_id, status, last_activity_at desc)` and `(status, created_at desc)`      |
| `student_destination_countries` | Composite PK `(student_id, country_setting_id)`                                                               |
| `schools`                       | Partial unique index on normalized `(name, country_setting_id, city)` for active records only                 |
| `programs`                      | Unique active constraint on `(school_id, name, level_setting_id)`                                             |
| `program_intakes`               | Unique on `(program_id, season, year)`                                                                        |
| `recommendations`               | Unique on `(run_id, program_id)`; all score columns are `numeric(5,2)` checked 0–100                          |
| `student_shortlists`            | Composite PK `(student_id, program_id)`                                                                       |
| `setting_values`                | Unique on `(group_id, key)`; referenced values must be disabled, not hard-deleted                             |
| `recommendation_weights`        | All four weight columns must sum to exactly 100 (DB check constraint)                                         |
| `notifications`                 | Index on `(user_id, read_at, created_at desc)`                                                                |
| `audit_logs`                    | `before_data`/`after_data` are sanitized JSONB — never passwords, raw tokens, or sensitive Telegram payloads  |
| `student_documents`             | `storage_key` never exposed publicly; `scan_status` must be `CLEAN` before staff can download                 |

---

## Relationship Map

```
users
  |-- 0..1 advisor_profiles
  |-- many auth_sessions
  |-- many team_invitations (as invitee or inviter)
  |-- many password_reset_tokens
  |-- 1 notification_preferences
  |-- many notifications / audit_logs

advisor_profiles
  |-- many students / follow_ups / conversations / student_applications
  |-- many specializations (through advisor_specializations)

students
  |-- many destination_countries / status_history / notes / follow_ups
  |-- many applications / conversations / recommendation_runs
  |-- many recommendations / shortlisted_programs / student_documents

schools --> many programs / applications / recommendations
programs --> many intakes / applications / recommendations / student_shortlists
conversations --> many conversation_messages
recommendation_runs --> many recommendations
```

---

## Transaction Boundaries

Use DB transactions for workflows that must succeed or fail atomically:

- **Invite member**: create user + invitation + audit + enqueue email.
- **Accept invitation**: validate token → set password → activate user → consume token → create preferences.
- **Assign advisor**: update student + write assignment/status history + notification + audit.
- **Change status**: update current status + append history row.
- **Schedule follow-up**: create follow-up + update student activity/status + notify advisor.
- **Generate recommendations**: create run + save all recommendation rows.
- **Cancel invitation**: consume invitation + remove/archive unaccepted account.

**Rule**: Do not send email or Telegram messages inside an open transaction. Commit first, then enqueue.

---

## Migration Strategy

Development: `npx prisma migrate dev --name <name>` then `npx prisma generate`.
Reset local DB only: `npx prisma migrate reset`.
Production: `npx prisma migrate deploy`.

Rules: never use `prisma db push` in production; never edit an applied migration; review generated SQL before committing; use expand-and-contract for breaking changes; back up before destructive changes; run `prisma migrate status` in CI.

### Recommended Migration Order

1. Users, sessions, invitations, password resets.
2. Settings groups and values.
3. Advisor profiles and specializations.
4. Students, destinations, status history.
5. Notes and follow-ups.
6. Schools, programs, and intakes.
7. Applications and application history.
8. Conversations, messages, Telegram idempotency.
9. Recommendation runs, recommendations, shortlists.
10. Notifications, preferences, audit logs.

---

## Seed Data (`prisma/seed.ts`)

Creates: one dev Admin (from env vars), role defaults, destination countries, program categories, study levels, initial recommendation weights, optional fictional schools/programs.

Bootstrap rules:

- Runs only in `development` or `test`.
- Validates `DATABASE_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_FULL_NAME` with Zod before connecting.
- Trim + lowercase email before lookup and storage. Hash password with Argon2id; never log it.
- Create bootstrap account directly as active Admin — no invitation email.
- Generate `public_id` dynamically (not a fixed `USR-0001`).
- Leave `last_login_at` empty until real login; set `password_changed_at` on creation.
- Idempotent: existing active Admin with the configured email is left unchanged.
- Never reset an existing password, promote a non-Admin, reactivate a disabled account, or silently create a duplicate Admin on rerun.
- Never run fixed-password seed in production. Production uses a separate one-time CLI bootstrap via secret manager.

---

## API Routes

All routes require authentication unless marked `(public)`.

### Auth

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
GET    /api/v1/auth/me
PATCH  /api/v1/auth/me
POST   /api/v1/auth/change-password
POST   /api/v1/auth/forgot-password            (public)
GET    /api/v1/auth/reset-password/:token      (public)
POST   /api/v1/auth/reset-password/:token      (public)
GET    /api/v1/auth/invitations/:token         (public)
POST   /api/v1/auth/invitations/:token/accept  (public)
```

### Team

```
GET    /api/v1/team
POST   /api/v1/team/invitations
POST   /api/v1/team/invitations/:invitationId/resend
DELETE /api/v1/team/invitations/:invitationId
GET    /api/v1/team/:userId
PATCH  /api/v1/team/:userId
PATCH  /api/v1/team/:userId/status
```

### Advisors

```
GET    /api/v1/advisors
GET    /api/v1/advisors/:advisorId
POST   /api/v1/advisors
PATCH  /api/v1/advisors/:advisorId
GET    /api/v1/advisors/:advisorId/students
GET    /api/v1/advisors/:advisorId/follow-ups
# Advisor self-access: /api/v1/advisors/me/...
```

### Students

```
GET    /api/v1/students
POST   /api/v1/students
GET    /api/v1/students/:studentId
PATCH  /api/v1/students/:studentId
PATCH  /api/v1/students/:studentId/advisor
PATCH  /api/v1/students/:studentId/status
GET    /api/v1/students/:studentId/notes
POST   /api/v1/students/:studentId/notes
PATCH  /api/v1/students/:studentId/notes/:noteId
DELETE /api/v1/students/:studentId/notes/:noteId
GET    /api/v1/students/:studentId/follow-ups
POST   /api/v1/students/:studentId/follow-ups
PATCH  /api/v1/students/:studentId/follow-ups/:followUpId
POST   /api/v1/students/:studentId/follow-ups/:followUpId/complete
POST   /api/v1/students/:studentId/follow-ups/:followUpId/cancel
```

### Schools

```
GET    /api/v1/schools
POST   /api/v1/schools
GET    /api/v1/schools/:schoolId
PATCH  /api/v1/schools/:schoolId
PATCH  /api/v1/schools/:schoolId/status
DELETE /api/v1/schools/:schoolId       # fails if linked records exist; soft-delete preferred
GET    /api/v1/schools/:schoolId/programs
```

### Programs

```
GET    /api/v1/programs
POST   /api/v1/programs
GET    /api/v1/programs/:programId
PATCH  /api/v1/programs/:programId
PATCH  /api/v1/programs/:programId/status
DELETE /api/v1/programs/:programId
```

### Applications

```
GET    /api/v1/applications
POST   /api/v1/students/:studentId/applications
GET    /api/v1/applications/:applicationId
PATCH  /api/v1/applications/:applicationId
PATCH  /api/v1/applications/:applicationId/status
```

### Conversations

```
GET    /api/v1/conversations
GET    /api/v1/conversations/:conversationId
GET    /api/v1/conversations/:conversationId/messages
POST   /api/v1/conversations/:conversationId/replies
PATCH  /api/v1/conversations/:conversationId/advisor
POST   /api/v1/conversations/:conversationId/escalate
POST   /api/v1/conversations/:conversationId/resolve
POST   /api/v1/webhooks/telegram                       (public, secret-verified)
```

### Recommendations

```
POST   /api/v1/students/:studentId/recommendation-runs
GET    /api/v1/students/:studentId/recommendations    # includes score breakdown, reasons, missing reqs, scoring version
GET    /api/v1/recommendation-runs/:runId
POST   /api/v1/students/:studentId/shortlists
DELETE /api/v1/students/:studentId/shortlists/:programId
```

### Settings

```
GET    /api/v1/settings
GET    /api/v1/settings/:groupKey
POST   /api/v1/settings/:groupKey/values
PATCH  /api/v1/settings/:groupKey/values/:valueId
DELETE /api/v1/settings/:groupKey/values/:valueId
GET    /api/v1/settings/recommendation-weights
PUT    /api/v1/settings/recommendation-weights
```

### Notifications

```
GET    /api/v1/notifications
PATCH  /api/v1/notifications/:notificationId/read
POST   /api/v1/notifications/read-all
DELETE /api/v1/notifications
GET    /api/v1/notification-preferences
PUT    /api/v1/notification-preferences
```

### Dashboard & Search

```
GET    /api/v1/dashboard/summary
GET    /api/v1/search?q=     # applies the authenticated user's authorization scope
```

---

## Query Conventions

List endpoints accept: `page`, `pageSize` (max 100), `search`, `sort`, `order`, `status`, `country`, `advisorId`.
Allowlist sortable fields; never concatenate user input into SQL; return total count and page count.
Consider cursor pagination later for messages and audit logs.

---

## Validation

Use Zod for: env vars, route params, query strings, request bodies, public API response contracts.
Validation does not replace service rules or database constraints.

---

## OpenAPI

Expose only when `OPENAPI_ENABLED=true`: `GET /openapi.json`, `GET /docs`.
Every route documents: auth requirements, allowed roles, params/query/body, success/validation/auth/forbidden/not-found/conflict responses.
Derive schemas from the same Zod schemas used at runtime. Do not expose stack traces or production-only admin details.

---

## Telegram Integration

### Webhook Security

- Configure Telegram with a secret webhook token.
- Verify `X-Telegram-Bot-Api-Secret-Token`.
- Rate limit and size-limit webhook payloads.
- Insert `telegram_updates.update_id` before processing.
- Ignore duplicate updates.
- Acknowledge quickly and process heavier work asynchronously.

### Inbound Message Flow

```
Telegram update
  -> verify secret
  -> enforce idempotency
  -> find or create student
  -> find or create conversation
  -> persist message
  -> update last activity
  -> enqueue extraction/summary job
  -> optionally send agent response
```

### Advisor Reply Flow

```
Authenticated advisor request
  -> verify student/conversation ownership
  -> persist pending advisor message
  -> enqueue Telegram delivery
  -> send through Telegram API
  -> mark delivered or failed
```

---

## Recommendation Engine

Deterministic weighted scoring:

```
overall = programFit * programWeight + budgetFit * budgetWeight
        + intakeFit  * intakeWeight  + visaFit   * visaWeight
```

Weights total 100 and are versioned in `recommendation_weights`. Each run stores: student input snapshot, active program/school data used, weight/scoring version, individual scores, reasons, and missing requirements — making results reproducible and auditable.

---

## Background Jobs

Use queues for: invitation/reset emails, follow-up reminders, Telegram delivery retries, conversation summaries/preference extraction, recommendation generation, notification fan-out, scheduled cleanup of expired tokens and old webhook payloads.

Requirements: stable job names, idempotency keys, retry limits with exponential backoff, dead-letter/failed-job inspection, structured logs with entity and request IDs. No raw passwords or token values in job payloads.

---

## Email

Templates: team invitation, invitation resent, password reset, follow-up reminder (if enabled), account access changed (if required).
Links: `${FRONTEND_URL}/set-password/:token` and `${FRONTEND_URL}/reset-password/:token`.
Style: brand `#045A58`, hover/dark accent `#034A48`, light panel `#E6F4F3`, neutral bg `#F5F6F8`, white surface, subtle borders, concise operational copy.
Development: use a local mail-capture service (e.g. Mailpit) — do not send real messages.

---

## Error Codes

| Code               | HTTP | Notes                                                                                                                                                |
| ------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR` | 400  |                                                                                                                                                      |
| `UNAUTHENTICATED`  | 401  |                                                                                                                                                      |
| `FORBIDDEN`        | 403  |                                                                                                                                                      |
| `NOT_FOUND`        | 404  |                                                                                                                                                      |
| `CONFLICT`         | 409  | Duplicate email/school/program, advisor at capacity, invitation already accepted/canceled, setting value in use, stale optimistic-concurrency update |
| `RATE_LIMITED`     | 429  |                                                                                                                                                      |
| `INTERNAL_ERROR`   | 500  |                                                                                                                                                      |

The global error handler maps known errors to stable public responses and logs unexpected errors once.

---

## Logging & Audit

**Application logs** answer: "What is the service doing?"
**Audit logs** answer: "Who changed business data?"

Log fields: request ID, authenticated user ID, route + method, response status, duration, entity IDs, error code.

Audit these actions: login failures, session revocation, invitation CRUD, role/permission/status changes, advisor assignment, student/application status changes, school/program CRUD, settings and recommendation-weight changes.

Redact from all logs: passwords, tokens, auth headers, cookies, SMTP credentials, Telegram bot tokens.

---

## Security Checklist

- HTTPS in production.
- Secure, HttpOnly refresh cookie.
- Explicit CORS origin and credentials configuration.
- Helmet enabled.
- JSON body-size limits.
- Rate limits on authentication and webhooks.
- Argon2id password hashing.
- Hashed opaque tokens.
- Short token expiry.
- Session rotation and revocation.
- Generic forgot-password responses.
- Backend role and ownership checks.
- Parameterized queries through Prisma.
- Zod validation.
- Sanitized logs and audit records.
- Dependency scanning.
- Database backups and restore testing.
- No direct database access from the frontend.

If access tokens are stored in cookies instead of Authorization headers, add CSRF protection for state-changing requests.

---

## Testing Strategy

**Unit** — test pure business rules without a live database: recommendation scoring, advisor capacity checks, status transition rules, password/token helpers, permission/ownership decisions.

**Integration** (dedicated test DB): auth login/refresh/logout, invitation acceptance, student CRUD/assignment, advisor ownership restrictions, notes/follow-ups, school/program constraints, settings dependency protection, transaction rollback.

**HTTP** (Supertest, no real port): status codes, response shapes, validation errors, authentication, role restrictions, pagination metadata.

**Webhook**: valid/invalid Telegram secret, duplicate update ID, student/conversation creation, message persistence, retry-safe processing.

**File**: reject unsupported MIME types and oversized files; object keys not client-selectable; advisors cannot access unassigned student documents; signed URLs expire; rejected malware scans never become downloadable.

**Minimum CI**:

```powershell
npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build && npm run db:status
```

---

## Health & Graceful Shutdown

- `GET /health/live` — Node process responsive.
- `GET /health/ready` — PostgreSQL reachable.

On `SIGTERM`/`SIGINT`: stop accepting connections → finish in-flight requests (timeout) → stop workers → disconnect Prisma and Redis → exit with correct status.

---

## Deployment

**Dockerfile**: multi-stage build, production deps only in final image, non-root runtime user, health check, `NODE_ENV=production`. Run migrations as a separate release step — not from every replica concurrently.

**Deployment order**: backup → `prisma migrate deploy` → deploy API → deploy workers → verify readiness → smoke-test login, Telegram webhook, email queue, and one protected endpoint.

**Production services — minimum**: API, PostgreSQL, email provider, HTTPS/domain.
**Add when queues begin**: Redis, worker service.
**Add when documents begin**: private object-storage bucket, malware-scanning workflow.

**Observability**: structured logs from day one. Add `@sentry/node` or OpenTelemetry when separate API + worker deployment makes production diagnosis difficult. Do not add multiple monitoring SDKs before there is an operational plan for alerts and retention.

---

## Implementation Phases

| Phase | Focus                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Project scaffold, env validation, Express + error handling, PostgreSQL + Prisma, logging/health/OpenAPI, test infra                                                              |
| 2     | Users, sessions, token rotation, login/refresh/logout/me, team invitations, forgot/reset password, notification preferences                                                      |
| 3     | Advisor profiles + specializations, student CRUD + assignment/capacity, status history, notes, follow-ups, advisor-scoped auth                                                   |
| 4     | Settings groups/values, school CRUD, program CRUD + intakes, dependency-safe deletion, search/filter/sort/pagination                                                             |
| 5     | Telegram webhook verification + idempotency, message ingestion, conversation list/detail, advisor assignment/escalation/resolution/replies, summary + preference extraction jobs |
| 6     | Versioned recommendation weights, deterministic scoring engine, recommendation runs + evidence, shortlists, applications + status history, private documents                     |
| 7     | In-app notifications, follow-up reminders, dashboard metrics, global authorized search, export + reporting jobs                                                                  |

---

## First Milestone (Vertical Slice)

```
Admin logs in
  -> invites an Advisor
  -> Advisor accepts invitation and sets password
  -> Advisor logs in
  -> Admin creates/imports a student
  -> Admin assigns the student
  -> Advisor can see only that student
  -> Advisor changes status
  -> Advisor adds a note
  -> Advisor schedules and completes a follow-up
  -> Every important change is audited
```

Validates: authentication, authorization, relational modeling, migrations, validation, transactions, API docs, and frontend integration — before Telegram and recommendation complexity is added.

---

## Definition of Done (per module)

A backend module is complete when it has:

- Database migration and indexes.
- Zod request validation.
- Authorization rules.
- Service-level business rules.
- Consistent responses and errors.
- OpenAPI documentation.
- Unit tests for important rules.
- Integration tests for database behavior.
- Audit logging where required.
- No secrets or sensitive data in logs.
- Frontend contract documented in `AGENTS.md` and `contextF.md`.

---

## Key Architectural Decisions

- Modular monolith first.
- PostgreSQL is the source of truth.
- Prisma migrations committed and deployed explicitly.
- Dev/test seed creates first active Admin without email; production uses a separate one-time deployment bootstrap.
- Emails trimmed and lowercased at the application boundary before lookup and storage.
- ESLint with type-aware TypeScript rules; Prettier is source of truth for formatting.
- Advisors scoped to assigned students. Team account management is separate from advisor workload.
- Operations staff manage school/program data but do not automatically receive advisor permissions.
- Notes are internal; follow-ups are actionable scheduled work.
- Recommendation evidence stored and versioned.
- Telegram webhooks are idempotent.
- Destructive actions preserve referenced operational history.
- Slow external work queued when first needed.
- Private files use object storage with short-lived authorized access.

---

## Official References

- Express: https://expressjs.com/en/starter/installing.html
- Prisma PostgreSQL quickstart: https://www.prisma.io/docs/getting-started/prisma-orm/quickstart/postgresql
- Prisma migrations: https://www.prisma.io/docs/orm/prisma-migrate
- Zod: https://zod.dev/
- Vitest: https://vitest.dev/guide/
- OpenAPI: https://spec.openapis.org/oas/latest.html
- Telegram webhooks: https://core.telegram.org/bots/api#setwebhook
