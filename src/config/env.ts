import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  COOKIE_SECRET: z.string().min(1, 'COOKIE_SECRET is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  DOCS_ENABLED: z.coerce.boolean().default(true),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Email (Optional in dev)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('School Finder AI <no-reply@example.com>'),

  // Telegram Integration
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),

  // Centrifugo Integration
  CENTRIFUGO_API_URL: z.string().default('http://localhost:8000/api'),
  CENTRIFUGO_API_KEY: z.string().optional(),
  CENTRIFUGO_HMAC_SECRET: z.string().optional(),

  // Redis / Queue
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}


export const env = {
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  databaseUrl: parsed.data.DATABASE_URL,
  cookieSecret: parsed.data.COOKIE_SECRET,
  jwtSecret: parsed.data.JWT_SECRET,
  docsEnabled: parsed.data.DOCS_ENABLED,
  frontendUrl: parsed.data.FRONTEND_URL,

  smtpHost: parsed.data.SMTP_HOST,
  smtpPort: parsed.data.SMTP_PORT,
  smtpSecure: parsed.data.SMTP_SECURE,
  smtpUser: parsed.data.SMTP_USER,
  smtpPassword: parsed.data.SMTP_PASSWORD,
  emailFrom: parsed.data.EMAIL_FROM,

  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  telegramWebhookSecret: parsed.data.TELEGRAM_WEBHOOK_SECRET,
  telegramWebhookUrl: parsed.data.TELEGRAM_WEBHOOK_URL,

  centrifugoApiUrl: parsed.data.CENTRIFUGO_API_URL,
  centrifugoApiKey: parsed.data.CENTRIFUGO_API_KEY,
  centrifugoHMACSecret: parsed.data.CENTRIFUGO_HMAC_SECRET,

  redisUrl: parsed.data.REDIS_URL,
}

export default env
