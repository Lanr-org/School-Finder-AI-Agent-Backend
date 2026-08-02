import { Bot } from 'grammy'
import env from '../../../config/env.js'
import { logger } from '../../../config/logger.js'

export class TelegramBotService {
  private static botInstance: Bot | null = null

  /**
   * Returns the singleton Grammy Bot instance.
   */
  static getBot(): Bot {
    if (!this.botInstance) {
      if (!env.telegramBotToken) {
        throw new Error('TELEGRAM_BOT_TOKEN is not configured in environment.')
      }

      this.botInstance = new Bot(env.telegramBotToken)
      logger.info('Telegram Bot instance initialized successfully.')
    }

    return this.botInstance
  }

  /**
   * Helper method to register the public HTTPS Webhook URL with Telegram API servers.
   */
  static async registerWebhook(): Promise<boolean> {
    if (!env.telegramWebhookUrl || !env.telegramWebhookSecret) {
      logger.warn('Skipping Telegram webhook registration: URL or Secret not configured.')
      return false
    }

    try {
      const bot = this.getBot()
      await bot.api.setWebhook(env.telegramWebhookUrl, {
        secret_token: env.telegramWebhookSecret,
        allowed_updates: ['message', 'callback_query'],
      })

      logger.info({ webhookUrl: env.telegramWebhookUrl }, 'Telegram webhook registered successfully.')
      return true
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Failed to register Telegram webhook.')
      return false
    }
  }
}
