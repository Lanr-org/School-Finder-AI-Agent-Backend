import app from './app'
import http from 'http'
import env from './config/env'
import { logger } from './config/logger'
import { TelegramBotService } from './integrations/telegram/services/telegram-bot.service'
import './jobs/workers/telegram-inbound.worker.js'
import './jobs/workers/telegram-outbound.worker.js'


const server = http.createServer(app)

server.listen(env.port, async () => {
  logger.info({ port: env.port }, 'Server started')

  // Automatically register Telegram Webhook URL with Telegram API on startup
  if (env.telegramWebhookUrl) {
    await TelegramBotService.registerWebhook()
  }
})

const gracefulShutdown = (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal. Closing HTTP server cleanly...')
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGABRT', () => gracefulShutdown('SIGABRT'))

