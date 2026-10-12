import { Worker } from 'bullmq'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { captureWorkerFailure } from '../../config/sentry.js'
import { ProgramSourceCheckService } from '../../modules/programs/programSourceCheck.js'

const parseRedisUrl = (url: string) => {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '6379', 10),
  }
}

/**
 * Worker that re-reads every verified programme's course page once a week.
 */
export const programSourceCheckWorker = new Worker(
  'program-source-check',
  async () => ProgramSourceCheckService.CheckAllVerified(),
  {
    connection: parseRedisUrl(env.redisUrl),
    concurrency: 1,
    // A full run reads many pages one at a time; keep the lock well past a slow run.
    lockDuration: 30 * 60 * 1000,
  },
)

programSourceCheckWorker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, error: err.message },
    'Programme source check failed.',
  )
  captureWorkerFailure('program-source-check', job, err)
})
