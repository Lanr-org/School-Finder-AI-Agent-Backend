import { Worker, type Job } from 'bullmq'
import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { processAiReply } from '../../modules/ai/ai-reply.job.js'
import type { AiReplyJob } from '../queues.js'

const parseRedisUrl = (url: string) => {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '6379', 10),
  }
}

/**
 * Worker that answers student messages with the AI, off the request path.
 */
export const aiReplyWorker = new Worker<AiReplyJob>(
  'ai-reply',
  async (job: Job<AiReplyJob>) => {
    const outcome = await processAiReply(job.data)
    logger.info(
      { jobId: job.id, conversationId: job.data.conversationId, outcome },
      'AI reply job done.',
    )
    return outcome
  },
  {
    connection: parseRedisUrl(env.redisUrl),
    concurrency: 5,
  },
)

aiReplyWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'AI reply job failed.')
})
