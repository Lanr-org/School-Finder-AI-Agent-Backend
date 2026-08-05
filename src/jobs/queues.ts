import { Queue } from 'bullmq'
import env from '../config/env.js'

// Parse REDIS_URL into host & port connection object for BullMQ
const parseRedisUrl = (url: string) => {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || '127.0.0.1',
    port: parseInt(parsed.port || '6379', 10),
  }
}

const connection = parseRedisUrl(env.redisUrl)

/**
 * Queue for incoming Telegram webhooks (Inbound processing)
 */
export const telegramInboundQueue = new Queue('telegram-inbound', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
})

/**
 * Queue for outgoing messages to Telegram API (Outbound sending)
 */
export const telegramOutboundQueue = new Queue('telegram-outbound', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 100,
  },
})
