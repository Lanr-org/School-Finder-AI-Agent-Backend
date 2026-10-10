import { Worker } from 'bullmq'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { captureWorkerFailure } from '../../config/sentry.js'
import { SponsorRegisterService } from '../../modules/schools/sponsorRegister.service.js'

const parseRedisUrl = (url: string) => {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '6379', 10),
  }
}

/**
 * Worker that refreshes every UK school's visa-sponsor status from the Home Office register.
 */
export const sponsorRegisterWorker = new Worker(
  'sponsor-register',
  async () => {
    const summary = await SponsorRegisterService.SyncUk()
    return { licensed: summary.licensed, notListed: summary.notListed, changed: summary.changed }
  },
  {
    connection: parseRedisUrl(env.redisUrl),
    concurrency: 1,
  },
)

sponsorRegisterWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Sponsor register sync failed.')
  captureWorkerFailure('sponsor-register', job, err)
})
