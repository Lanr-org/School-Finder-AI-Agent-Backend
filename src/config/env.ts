import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

export const LLM_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  COOKIE_SECRET: z.string().min(1, 'COOKIE_SECRET is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  DOCS_ENABLED: z.stringbool().default(true),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Email (Optional in dev)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().default('Smetase <no-reply@example.com>'),

  // Telegram Integration
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  // Without the leading @; used for t.me links that connect a web account to Telegram.
  TELEGRAM_BOT_USERNAME: z.string().optional(),

  // LLM: the provider that answers first, then the fallbacks tried in order when it fails
  // (overloaded, rate limited, down), e.g. "openai,gemini" or "none". Each needs its own key below.
  LLM_PROVIDER: z.enum(LLM_PROVIDERS).default('gemini'),
  LLM_FALLBACK_PROVIDERS: z
    .string()
    .default('none')
    .transform((value) => value.split(',').map((p) => p.trim().toLowerCase()).filter((p) => p && p !== 'none'))
    .pipe(z.array(z.enum(LLM_PROVIDERS))),

  // Anthropic (Claude)
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),

  // Gemini (LLM) Integration
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),

  // Centrifugo Integration
  CENTRIFUGO_API_URL: z.string().default('http://localhost:8000/api'),
  CENTRIFUGO_API_KEY: z.string().optional(),
  CENTRIFUGO_HMAC_SECRET: z.string().optional(),

  // Redis / Queue
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  // AI usage limits (replies per UTC day, Telegram messages per minute per chat)
  AI_DAILY_REPLIES_PER_STUDENT: z.coerce.number().int().positive().default(40),
  AI_DAILY_REPLIES_GLOBAL: z.coerce.number().int().positive().default(1500),
  TELEGRAM_MESSAGES_PER_MINUTE: z.coerce.number().int().positive().default(20),

  // Student sign-in
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  // Separate from JWT_SECRET so a student token can never pass staff verification.
  STUDENT_JWT_SECRET: z.string().min(32, 'STUDENT_JWT_SECRET must be at least 32 characters'),
  STUDENT_APP_URL: z.string().url().default('http://localhost:5174'),
}).refine((vars) => vars.STUDENT_JWT_SECRET !== vars.JWT_SECRET, {
  message: 'STUDENT_JWT_SECRET must be different from JWT_SECRET',
  path: ['STUDENT_JWT_SECRET'],
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
  telegramBotUsername: parsed.data.TELEGRAM_BOT_USERNAME,

  llmProvider: parsed.data.LLM_PROVIDER,
  llmFallbackProviders: parsed.data.LLM_FALLBACK_PROVIDERS,
  anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
  anthropicModel: parsed.data.ANTHROPIC_MODEL,
  openaiApiKey: parsed.data.OPENAI_API_KEY,
  openaiModel: parsed.data.OPENAI_MODEL,

  geminiApiKey: parsed.data.GEMINI_API_KEY,
  geminiModel: parsed.data.GEMINI_MODEL,

  centrifugoApiUrl: parsed.data.CENTRIFUGO_API_URL,
  centrifugoApiKey: parsed.data.CENTRIFUGO_API_KEY,
  centrifugoHMACSecret: parsed.data.CENTRIFUGO_HMAC_SECRET,

  redisUrl: parsed.data.REDIS_URL,

  aiDailyRepliesPerStudent: parsed.data.AI_DAILY_REPLIES_PER_STUDENT,
  aiDailyRepliesGlobal: parsed.data.AI_DAILY_REPLIES_GLOBAL,
  telegramMessagesPerMinute: parsed.data.TELEGRAM_MESSAGES_PER_MINUTE,

  googleClientId: parsed.data.GOOGLE_CLIENT_ID,
  studentJwtSecret: parsed.data.STUDENT_JWT_SECRET,
  studentAppUrl: parsed.data.STUDENT_APP_URL,
}

export default env
