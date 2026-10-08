import type { Server } from 'http'
import type { Logger } from 'pino'

type Closable = { name: string; close: () => Promise<unknown> }

type ShutdownDeps = {
  server: Server
  // BullMQ workers — close() lets the active job finish and takes no new ones.
  workers: Closable[]
  // BullMQ queues — close() releases their Redis connections.
  queues: Closable[]
  prisma: { $disconnect: () => Promise<void> }
  logger: Logger
  exit: (code: number) => void
  // In-flight request allowance.
  httpDrainMs?: number
  // Whole-sequence cap; must stay under the platform's SIGTERM→SIGKILL grace period.
  hardDeadlineMs?: number
}

const HTTP_DRAIN_MS = 10_000
const HARD_DEADLINE_MS = 25_000 // under the common 30s SIGTERM→SIGKILL grace period

// Order per AGENTS.md: stop accepting connections → finish in-flight requests
// (bounded) → stop workers → disconnect Redis and Prisma → exit with the right code.
export const createShutdown = (deps: ShutdownDeps) => {
  let shuttingDown = false

  return async (signal: string) => {
    // A second signal during shutdown (e.g. Ctrl+C twice) must not restart the sequence.
    if (shuttingDown) return
    shuttingDown = true
    let exitCode = 0
    const { logger } = deps
    logger.info({ signal }, 'Shutdown started')

    // Last resort: if anything below hangs, still exit before the platform SIGKILLs us.
    const hardDeadline = setTimeout(() => {
      logger.error('Shutdown exceeded hard deadline; forcing exit')
      deps.exit(1)
    }, deps.hardDeadlineMs ?? HARD_DEADLINE_MS)
    hardDeadline.unref()

    // 1. Stop accepting connections and let in-flight requests finish (bounded).
    await new Promise<void>((resolve) => {
      const drainTimer = setTimeout(() => {
        logger.warn(
          'In-flight requests did not finish in time; closing remaining connections',
        )
        exitCode = 1
        deps.server.closeAllConnections()
        resolve()
      }, deps.httpDrainMs ?? HTTP_DRAIN_MS)
      deps.server.close(() => {
        clearTimeout(drainTimer)
        resolve()
      })
      // Idle keep-alive sockets would otherwise hold server.close() open until they time out.
      deps.server.closeIdleConnections()
    })

    // 2–4. Workers, then queues (Redis), then Prisma. A failure in one step is
    // logged and the rest still run, so connections aren't leaked.
    const steps: Closable[] = [
      ...deps.workers,
      ...deps.queues,
      { name: 'prisma', close: () => deps.prisma.$disconnect() },
    ]
    for (const step of steps) {
      try {
        await step.close()
      } catch (error) {
        exitCode = 1
        logger.error({ err: error, step: step.name }, 'Shutdown step failed')
      }
    }

    clearTimeout(hardDeadline)
    logger.info({ exitCode }, 'Shutdown complete')
    deps.exit(exitCode)
  }
}
