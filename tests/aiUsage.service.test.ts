import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiUsageService } from '../src/modules/ai/aiUsage.service'
import { getRedis } from '../src/database/redis'

vi.mock('../src/database/redis', () => ({ getRedis: vi.fn() }))
vi.mock('../src/config/env', () => ({
  default: {
    aiDailyRepliesPerStudent: 2,
    aiDailyRepliesGlobal: 3,
    telegramMessagesPerMinute: 2,
  },
}))

const redis = {
  incr: vi.fn(),
  decr: vi.fn(),
  expire: vi.fn(),
}

describe('AiUsageService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getRedis).mockReturnValue(redis as never)
  })

  describe('TryConsume', () => {
    it('allows a reply under both limits and sets a TTL on the first hit', async () => {
      redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1)

      await expect(AiUsageService.TryConsume('s1')).resolves.toEqual({
        allowed: true,
      })
      expect(redis.expire).toHaveBeenCalledTimes(2)
    })

    it('denies at the student limit and gives the shared budget back', async () => {
      redis.incr.mockResolvedValueOnce(2).mockResolvedValueOnce(3)

      await expect(AiUsageService.TryConsume('s1')).resolves.toEqual({
        allowed: false,
        reason: 'STUDENT_DAILY',
      })
      expect(redis.decr).toHaveBeenCalledTimes(2)
    })

    it('denies at the global cap without touching the student counter', async () => {
      redis.incr.mockResolvedValueOnce(4)

      await expect(AiUsageService.TryConsume('s1')).resolves.toEqual({
        allowed: false,
        reason: 'GLOBAL_DAILY',
      })
      expect(redis.incr).toHaveBeenCalledTimes(1)
      expect(redis.decr).toHaveBeenCalledTimes(1)
    })

    it('fails open when Redis errors', async () => {
      redis.incr.mockRejectedValue(new Error('redis down'))

      await expect(AiUsageService.TryConsume('s1')).resolves.toEqual({
        allowed: true,
      })
    })
  })

  describe('ConsumeTelegramMessage', () => {
    it('allows up to the per-minute limit, then blocks', async () => {
      redis.incr
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)

      await expect(AiUsageService.ConsumeTelegramMessage('c1')).resolves.toBe(
        true,
      )
      await expect(AiUsageService.ConsumeTelegramMessage('c1')).resolves.toBe(
        true,
      )
      await expect(AiUsageService.ConsumeTelegramMessage('c1')).resolves.toBe(
        false,
      )
    })

    it('fails open when Redis errors', async () => {
      redis.incr.mockRejectedValue(new Error('redis down'))

      await expect(AiUsageService.ConsumeTelegramMessage('c1')).resolves.toBe(
        true,
      )
    })
  })
})
