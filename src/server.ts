import app from './app'
import http from 'http'
import env from './config/env'
import { logger } from './config/logger'
import prisma from './database/prisma'
import { TelegramBotService } from './integrations/telegram/services/telegram-bot.service'
import { telegramInboundQueue, telegramOutboundQueue } from './jobs/queues.js'
// Importing the workers starts them.
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
  ],
  prisma,
  logger,
  exit: (code) => process.exit(code),
})

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
