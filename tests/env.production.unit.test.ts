import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type appEnv from '../src/config/env.js'

// env.ts validates process.env when first imported, so each case sets the variables it cares
// about, resets the module registry, and imports it fresh. Every var is set explicitly so the
// developer's own .env (loaded by dotenv, which never overrides) can't change the outcome.
const BASE: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/app',
  COOKIE_SECRET: 'c'.repeat(32),
  JWT_SECRET: 'j'.repeat(32),
  STUDENT_JWT_SECRET: 's'.repeat(40),
  GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
  FRONTEND_URL: 'https://staff.example.com',
  STUDENT_APP_URL: 'https://app.example.com',
  DOCS_ENABLED: '',
  TRUST_PROXY: '',
  SENTRY_DSN: '',
}

const original = { ...process.env }

type Env = typeof appEnv

const loadEnv = async (overrides: Record<string, string> = {}): Promise<Env> => {
  vi.resetModules()
  for (const [key, value] of Object.entries({ ...BASE, ...overrides })) {
    // An empty string means "unset": zod sees undefined, like a missing variable on the host.
    if (value === '') delete process.env[key]
    else process.env[key] = value
  }
  // Under the project's CommonJS output the namespace nests the default export one level deeper.
  const module = (await import('../src/config/env.js')) as unknown as { default: Env }
  return module.default
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key]
  }
  Object.assign(process.env, original)
})

describe('production env validation', () => {
  it('accepts a correct production configuration', async () => {
    const env = await loadEnv()
    expect(env.nodeEnv).toBe('production')
  })

  it.each(['JWT_SECRET', 'COOKIE_SECRET'])('rejects a short %s in production', async (key) => {
    await expect(loadEnv({ [key]: 'too-short' })).rejects.toThrow('Invalid environment variables')
  })

  it.each(['FRONTEND_URL', 'STUDENT_APP_URL'])('rejects a non-https %s in production', async (key) => {
    await expect(loadEnv({ [key]: 'http://app.example.com' })).rejects.toThrow('Invalid environment variables')
  })

  it('does not apply those rules outside production', async () => {
    const env = await loadEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'short-dev-secret',
      COOKIE_SECRET: 'short',
      FRONTEND_URL: 'http://localhost:5173',
      STUDENT_APP_URL: 'http://localhost:5174',
    })
    expect(env.nodeEnv).toBe('development')
  })
})

describe('docs and proxy defaults', () => {
  it('turns the API docs off in production unless asked', async () => {
    expect((await loadEnv()).docsEnabled).toBe(false)
    expect((await loadEnv({ DOCS_ENABLED: 'true' })).docsEnabled).toBe(true)
  })

  it('leaves the API docs on in development', async () => {
    expect((await loadEnv({ NODE_ENV: 'development' })).docsEnabled).toBe(true)
  })

  it('does not trust a proxy unless told how many', async () => {
    expect((await loadEnv()).trustProxy).toBe(0)
    expect((await loadEnv({ TRUST_PROXY: '1' })).trustProxy).toBe(1)
  })

  it('rejects a nonsense proxy count', async () => {
    await expect(loadEnv({ TRUST_PROXY: '-1' })).rejects.toThrow('Invalid environment variables')
  })
})
