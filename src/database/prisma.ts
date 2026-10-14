import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma'
import env from '../config/env'
import { logger } from '../config/logger'
import { RetryingPool, withConnectRetry } from './pool'

// The pool retries opening connections while Neon wakes from sleep (see ./pool). The adapter
// owns it, so prisma.$disconnect() also closes it.
const adapter = new PrismaPg(new RetryingPool({ connectionString: env.databaseUrl }), {
  disposeExternalPool: true,
})

const prisma = new PrismaClient({ adapter })

// Runs one query before the server starts taking requests, so the first real request after a
// deploy doesn't meet a sleeping database. Never throws: the server still starts, and requests
// retry on their own.
export const warmUpDatabase = async () => {
  const started = Date.now()
  try {
    await withConnectRetry(() => prisma.$queryRaw`SELECT 1`, [1000, 2000, 4000, 8000])
    logger.info({ ms: Date.now() - started }, 'Database connection ready.')
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Database warm-up failed; continuing.')
  }
}

export default prisma
