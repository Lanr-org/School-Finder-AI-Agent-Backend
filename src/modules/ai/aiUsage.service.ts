import env from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { getRedis } from '../../database/redis.js'

export type AiUsageDecision =
  | { allowed: true }
  | { allowed: false; reason: 'STUDENT_DAILY' | 'GLOBAL_DAILY' }

const DAY_KEY_TTL_SECONDS = 48 * 60 * 60
const MINUTE_KEY_TTL_SECONDS = 120

const utcDay = () => new Date().toISOString().slice(0, 10)

// Counts AI replies per UTC day and Telegram messages per minute, in Redis. Every method
// fails open: a Redis outage must not silence the bot (the spend limit in the provider's
// console is the backstop).
export class AiUsageService {
  static async TryConsume(studentId: string): Promise<AiUsageDecision> {
    try {
      const redis = getRedis()
      const day = utcDay()
      const globalKey = `ai:daily:global:${day}`
      const studentKey = `ai:daily:student:${studentId}:${day}`

      const globalCount = await redis.incr(globalKey)
      if (globalCount === 1) await redis.expire(globalKey, DAY_KEY_TTL_SECONDS)
      if (globalCount > env.aiDailyRepliesGlobal) {
        await redis.decr(globalKey)
        return { allowed: false, reason: 'GLOBAL_DAILY' }
      }

      const studentCount = await redis.incr(studentKey)
      if (studentCount === 1)
        await redis.expire(studentKey, DAY_KEY_TTL_SECONDS)
      if (studentCount > env.aiDailyRepliesPerStudent) {
        // A denied reply must not use up the shared budget.
        await redis.decr(studentKey)
        await redis.decr(globalKey)
        return { allowed: false, reason: 'STUDENT_DAILY' }
      }
      return { allowed: true }
    } catch (error) {
      logger.warn({ err: error }, 'AI usage check failed; allowing the reply.')
      return { allowed: true }
    }
  }

  // One AI call against the global daily cap only (interview calls don't use up the
  // student's chat replies). Pair with TryConsumeInterviewSession for the per-student limit.
  static async TryConsumeGlobal(): Promise<AiUsageDecision> {
    try {
      const redis = getRedis()
      const globalKey = `ai:daily:global:${utcDay()}`
      const count = await redis.incr(globalKey)
      if (count === 1) await redis.expire(globalKey, DAY_KEY_TTL_SECONDS)
      if (count > env.aiDailyRepliesGlobal) {
        await redis.decr(globalKey)
        return { allowed: false, reason: 'GLOBAL_DAILY' }
      }
      return { allowed: true }
    } catch (error) {
      logger.warn({ err: error }, 'AI usage check failed; allowing the call.')
      return { allowed: true }
    }
  }

  // Starting a mock interview, limited per student per UTC day.
  static async TryConsumeInterviewSession(studentId: string): Promise<AiUsageDecision> {
    try {
      const redis = getRedis()
      const key = `ai:interview:student:${studentId}:${utcDay()}`
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, DAY_KEY_TTL_SECONDS)
      if (count > env.interviewSessionsPerStudentPerDay) {
        await redis.decr(key)
        return { allowed: false, reason: 'STUDENT_DAILY' }
      }
      return { allowed: true }
    } catch (error) {
      logger.warn({ err: error }, 'Interview limit check failed; allowing.')
      return { allowed: true }
    }
  }

  // True when this Telegram chat is within its per-minute allowance.
  static async ConsumeTelegramMessage(chatId: string): Promise<boolean> {
    try {
      const redis = getRedis()
      const key = `ai:tg:min:${chatId}:${Math.floor(Date.now() / 60_000)}`
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, MINUTE_KEY_TTL_SECONDS)
      return count <= env.telegramMessagesPerMinute
    } catch (error) {
      logger.warn({ err: error }, 'Telegram rate check failed; allowing.')
      return true
    }
  }
}
