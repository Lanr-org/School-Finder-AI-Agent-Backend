import cors from 'cors'
import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import env from './config/env'
import { httpLogger } from './config/logger'
import { openApiDocument } from './docs/document'
import { errorHandler } from './middleware/errorHandler'
import { authRouter } from './modules/auth/auth.routes'
import { requestId } from './middleware/requestId'
import { requestContext } from './common/context/requestContext'
import { teamRouter } from './modules/team/team.routes'
import { schoolsRouter } from './modules/schools/schools.routes'
import { programsRouter } from './modules/programs/programs.routes'
import { studentsRouter } from './modules/students/students.routes'
import { advisorsRouter } from './modules/advisors/advisors.routes'
import { settingsRouter } from './modules/settings/settings.routes'
import { bulletinsRouter } from './modules/bulletins/bulletins.routes'
import { notificationsRouter } from './modules/notifications/notifications.routes'
import { visaRatesRouter } from './modules/visaRates/visaRates.routes'
import {
  recommendationRunsRouter,
  recommendationsRouter,
} from './modules/recommendations/recommendations.routes'
import { conversationsRouter } from './modules/conversations/conversations.routes'
import { applicationsRouter } from './modules/applications/applications.routes'
import { healthRouter } from './modules/health/health.routes'
import { auditLogsRouter } from './modules/audit/audit.routes'
import { dashboardRouter } from './modules/dashboard/dashboard.routes'
import { studentRouter } from './modules/studentAuth/studentAuth.routes'
import { studentPortalRouter } from './modules/studentPortal/studentPortal.routes'
import { studentLinkRouter } from './modules/studentLink/studentLink.routes'
import { publicStudyPlanRouter } from './modules/studyPlanLinks/studyPlanLinks.routes'
import telegramWebhookRouter from './integrations/telegram/routes/telegram.routes'

const app: Express = express()

app.use(requestId)
app.use(httpLogger)

// Only our two apps may call the API with cookies (was `origin: true`, which let any site in).
const allowedOrigins = [env.frontendUrl, env.studentAppUrl].map((url) => new URL(url).origin)
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser(env.cookieSecret))
app.use(helmet())
// After the body/cookie parsers so the per-request context survives them.
app.use(requestContext)

if (env.docsEnabled) {
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument))
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument))
}

// Public, unauthenticated probes — outside the versioned API prefix.
app.use('/health', healthRouter)

const version = `/api/v1`
app.use(`${version}/auth`, authRouter)
app.use(`${version}/team`, teamRouter)
app.use(`${version}/schools`, schoolsRouter)
app.use(`${version}/programs`, programsRouter)
app.use(`${version}/students`, studentsRouter)
app.use(`${version}/advisors`, advisorsRouter)
app.use(`${version}/settings`, settingsRouter)
app.use(`${version}/bulletins`, bulletinsRouter)
app.use(`${version}/visa-success-rates`, visaRatesRouter)
app.use(`${version}/recommendation-runs`, recommendationRunsRouter)
app.use(`${version}/recommendations`, recommendationsRouter)
app.use(`${version}/conversations`, conversationsRouter)
app.use(`${version}/notifications`, notificationsRouter)
app.use(`${version}/applications`, applicationsRouter)
app.use(`${version}/audit-logs`, auditLogsRouter)
app.use(`${version}/dashboard`, dashboardRouter)
// Student-facing API (Smetase web app); separate from the staff /students routes.
app.use(`${version}/student`, studentRouter)
app.use(`${version}/student`, studentPortalRouter)
app.use(`${version}/student`, studentLinkRouter)
// No sign-in: read-only Study Plan links a student shares with parents and sponsors.
app.use(`${version}/public`, publicStudyPlanRouter)

// Webhook routes
app.use(`${version}/webhooks`, telegramWebhookRouter)

app.use(errorHandler)

export default app
