import { Router } from 'express'
import { verifyTelegramWebhookSecret } from '../middlewares/telegram-secret-verify.middleware.js'
import { TelegramWebhookController } from '../controllers/telegram-webhook.controller.js'

const router = Router()

/**
 * Public Webhook Route for Telegram Updates
 * POST /api/v1/webhooks/telegram
 */
router.post(
  '/telegram',
  verifyTelegramWebhookSecret,
  TelegramWebhookController.handleWebhook
)

export default router
