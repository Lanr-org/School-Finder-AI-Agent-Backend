import { Redis } from 'ioredis'
import env from '../config/env.js'
import { logger } from '../config/logger.js'

let client: Redis | null = null

// Created on first use so importing a module never opens a connection (tests, scripts).
export const getRedis = (): Redis => {
  if (!client) {
    client = new Redis(env.redisUrl, { maxRetriesPerRequest: 1 })
    client.on('error', (error) =>
      logger.warn({ err: error }, 'Redis client error.'),
    )
  }
  return client
}

export const closeRedis = async (): Promise<void> => {
  if (!client) return
  const current = client
  client = null
  await current.quit()
}
