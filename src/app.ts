import cors from 'cors'
import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'
import helmet from 'helmet'
import swaggerUi from 'swagger-ui-express'
import env from './config/env'
import { httpLogger } from './config/logger'
import { openApiDocument } from './config/openapi'
import { errorHandler } from './middleware/errorHandler'
import { authRouter } from './modules/auth/auth.routes'
import { requestId } from './middleware/requestId'
import { teamRouter } from './modules/team/team.routes'
import { schoolsRouter } from './modules/schools/schools.routes'
import { programsRouter } from './modules/programs/programs.routes'
import { studentsRouter } from './modules/students/students.routes'
import { advisorsRouter } from './modules/advisors/advisors.routes'
import { settingsRouter } from './modules/settings/settings.routes'
import { bulletinsRouter } from './modules/bulletins/bulletins.routes'
import { visaRatesRouter } from './modules/visaRates/visaRates.routes'
import {
  recommendationRunsRouter,
  recommendationsRouter,
} from './modules/recommendations/recommendations.routes'
import { conversationsRouter } from './modules/conversations/conversations.routes'
import { applicationsRouter } from './modules/applications/applications.routes'
import telegramWebhookRouter from './integrations/telegram/routes/telegram.routes'

const app: Express = express()

app.use(requestId)
app.use(httpLogger)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser(env.cookieSecret))
app.use(helmet())

if (env.docsEnabled) {
  app.get('/openapi.json', (_req, res) => res.json(openApiDocument))
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument))
}

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
app.use(`${version}/applications`, applicationsRouter)

// Webhook routes
app.use(`${version}/webhooks`, telegramWebhookRouter)

app.use(errorHandler)

export default app
