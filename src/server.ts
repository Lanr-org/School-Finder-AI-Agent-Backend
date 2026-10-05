// Must stay first: starts Sentry before the rest of the app loads.
import './config/instrument'
import app from './app'
import http from 'http'
import env from './config/env'
import { logger } from './config/logger'
import { flushSentry } from './config/sentry'
import prisma from './database/prisma'
import { closeRedis } from './database/redis.js'
import { TelegramBotService } from './integrations/telegram/services/telegram-bot.service'
import { aiReplyQueue, telegramInboundQueue, telegramOutboundQueue } from './jobs/queues.js'
// Importing the workers starts them.
import { aiReplyWorker } from './jobs/workers/ai-reply.worker.js'
import { telegramInboundWorker } from './jobs/workers/telegram-inbound.worker.js'
import { telegramOutboundWorker } from './jobs/workers/telegram-outbound.worker.js'
import { createShutdown } from './shutdown'

const server = http.createServer(app)

server.listen(env.port, async () => {
  logger.info({ port: env.port }, 'Server started')

  // Automatically register Telegram Webhook URL with Telegram API on startup
  if (env.telegramWebhookUrl) {
    await TelegramBotService.registerWebhook()
  }
})

const shutdown = createShutdown({
  server,
  workers: [
    {
      name: 'telegram-inbound-worker',
      close: () => telegramInboundWorker.close(),
    },
    {
      name: 'telegram-outbound-worker',
      close: () => telegramOutboundWorker.close(),
    },
    {
      name: 'ai-reply-worker',
      close: () => aiReplyWorker.close(),
    },
  ],
  queues: [
    {
      name: 'telegram-inbound-queue',
      close: () => telegramInboundQueue.close(),
    },
    {
      name: 'telegram-outbound-queue',
      close: () => telegramOutboundQueue.close(),
    },
    {
      name: 'ai-reply-queue',
      close: () => aiReplyQueue.close(),
    },
    {
      name: 'redis-client',
      close: () => closeRedis(),
    },
    // Last, so errors raised while shutting down still get sent.
    {
      name: 'sentry',
      close: () => flushSentry(),
    },
  ],
  prisma,
  logger,
  exit: (code) => process.exit(code),
})

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
