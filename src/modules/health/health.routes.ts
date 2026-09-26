import express, { type Router } from 'express'
import prisma from '../../database/prisma.js'
import { logger } from '../../config/logger.js'
import { successResponse } from '../../http/response.js'

export const healthRouter: Router = express.Router()

const READY_TIMEOUT_MS = 2000

// Liveness: the process is up and serving requests. No dependency checks, so a
// database outage doesn't make the orchestrator restart otherwise-healthy replicas.
healthRouter.get('/live', (req, res) => {
  res.status(200).json(
    successResponse(
      true,
      'Service is live',
      { status: 'ok' },
      {
        requestId: req.id,
      },
    ),
  )
})

// Readiness: PostgreSQL is reachable (per AGENTS.md). Fails fast after 2s
// instead of hanging a probe on a stuck connection.
healthRouter.get('/ready', async (req, res) => {
  let timeout: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Database check timed out')),
          READY_TIMEOUT_MS,
        )
      }),
    ])
    res
      .status(200)
      .json(
        successResponse(
          true,
          'Service is ready',
          { status: 'ready', checks: { database: 'up' } },
          { requestId: req.id },
        ),
      )
  } catch (error) {
    logger.error({ err: error }, 'Readiness check failed: database unreachable')
    // Same error envelope as the rest of the API; no connection details exposed.
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service is not ready',
        requestId: req.id,
        details: { checks: { database: 'down' } },
      },
    })
  } finally {
    clearTimeout(timeout)
  }
})
