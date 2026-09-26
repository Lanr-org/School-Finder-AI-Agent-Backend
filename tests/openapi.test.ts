import './setup-env'
import type { Router } from 'express'
import { describe, expect, it } from 'vitest'
import app from '../src/app'
import { openApiDocument } from '../src/docs/document'
import { authRouter } from '../src/modules/auth/auth.routes'
import { teamRouter } from '../src/modules/team/team.routes'
import { schoolsRouter } from '../src/modules/schools/schools.routes'
import { programsRouter } from '../src/modules/programs/programs.routes'
import { studentsRouter } from '../src/modules/students/students.routes'
import { advisorsRouter } from '../src/modules/advisors/advisors.routes'
import { settingsRouter } from '../src/modules/settings/settings.routes'
import { bulletinsRouter } from '../src/modules/bulletins/bulletins.routes'
import { visaRatesRouter } from '../src/modules/visaRates/visaRates.routes'
import {
  recommendationRunsRouter,
  recommendationsRouter,
} from '../src/modules/recommendations/recommendations.routes'
import { conversationsRouter } from '../src/modules/conversations/conversations.routes'
import { applicationsRouter } from '../src/modules/applications/applications.routes'
import { auditLogsRouter } from '../src/modules/audit/audit.routes'
import { healthRouter } from '../src/modules/health/health.routes'
import telegramWebhookRouter from '../src/integrations/telegram/routes/telegram.routes'

// Mirrors the mounts in src/app.ts. The "every mounted router is listed" test
// below fails if a router is added to app.ts but not here.
const MOUNTS: [prefix: string, router: Router][] = [
  ['/health', healthRouter],
  ['/api/v1/auth', authRouter],
  ['/api/v1/team', teamRouter],
  ['/api/v1/schools', schoolsRouter],
  ['/api/v1/programs', programsRouter],
  ['/api/v1/students', studentsRouter],
  ['/api/v1/advisors', advisorsRouter],
  ['/api/v1/settings', settingsRouter],
  ['/api/v1/bulletins', bulletinsRouter],
  ['/api/v1/visa-success-rates', visaRatesRouter],
  ['/api/v1/recommendation-runs', recommendationRunsRouter],
  ['/api/v1/recommendations', recommendationsRouter],
  ['/api/v1/conversations', conversationsRouter],
  ['/api/v1/applications', applicationsRouter],
  ['/api/v1/audit-logs', auditLogsRouter],
  ['/api/v1/webhooks', telegramWebhookRouter],
]

type RouteLayer = {
  route?: { path: string; methods: Record<string, boolean> }
  name?: string
}

// Express 5 exposes each route's path and methods on the router stack.
const routesOf = (prefix: string, router: Router): string[] =>
  (router.stack as unknown as RouteLayer[]).flatMap((layer) => {
    if (!layer.route) return []
    const path =
      `${prefix}${layer.route.path === '/' ? '' : layer.route.path}`.replace(
        /:(\w+)/g,
        '{$1}',
      )
    return Object.keys(layer.route.methods)
      .filter((method) => layer.route?.methods[method])
      .map((method) => `${method.toUpperCase()} ${path}`)
  })

const implementedRoutes = MOUNTS.flatMap(([prefix, router]) =>
  routesOf(prefix, router),
)

const documentedRoutes = new Set(
  Object.entries(openApiDocument.paths ?? {}).flatMap(([path, item]) =>
    Object.keys(item as object).map(
      (method) => `${method.toUpperCase()} ${path}`,
    ),
  ),
)

describe('OpenAPI document', () => {
  it('generates a valid OpenAPI 3.1 document with the bearer scheme', () => {
    expect(openApiDocument.openapi).toBe('3.1.0')
    expect(Object.keys(openApiDocument.paths ?? {}).length).toBeGreaterThan(0)
    expect(openApiDocument.components?.securitySchemes).toHaveProperty(
      'bearerAuth',
    )
  })

  it('lists every router mounted in app.ts', () => {
    const appStack = (
      (app as unknown as { router?: { stack: RouteLayer[] } }).router?.stack ??
      []
    ).filter((layer) => layer.name === 'router')
    expect(appStack.length).toBe(MOUNTS.length)
  })

  // Guards the checks below against passing vacuously if Express ever stops
  // exposing routes on router.stack.
  it('finds routes on every mounted router', () => {
    const empty = MOUNTS.filter(
      ([prefix, router]) => routesOf(prefix, router).length === 0,
    ).map(([prefix]) => prefix)
    expect(empty, `No routes found under: ${empty.join(', ')}`).toEqual([])
  })

  // Every route must have an OpenAPI entry in its feature's <feature>.docs.ts,
  // registered in src/docs/document.ts (see AGENTS.md → Definition of Done).
  it('documents every implemented route', () => {
    const missing = implementedRoutes.filter(
      (route) => !documentedRoutes.has(route),
    )
    expect(missing, `Undocumented routes:\n${missing.join('\n')}`).toEqual([])
  })

  it('does not document routes that do not exist', () => {
    const implemented = new Set(implementedRoutes)
    const phantom = [...documentedRoutes].filter(
      (route) => !implemented.has(route),
    )
    expect(
      phantom,
      `Documented but not implemented:\n${phantom.join('\n')}`,
    ).toEqual([])
  })
})
