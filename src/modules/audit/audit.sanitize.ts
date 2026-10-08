import type { Prisma } from '../../generated/prisma/index.js'

const SENSITIVE_KEY = /password|token|hash|secret|cookie|authorization/i
const REDACTED = '[REDACTED]'

// Converts a snapshot into plain JSON and redacts sensitive keys at any depth.
// Callers already pass allowlisted fields; this is the safety net for mistakes.
export const sanitizeForAudit = (
  value: unknown,
): Prisma.InputJsonValue | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item)) as Prisma.InputJsonArray
  }
  if (typeof value === 'object') {
    // Prisma Decimal and similar value objects serialize via toJSON.
    if ('toJSON' in value && typeof value.toJSON === 'function') {
      return sanitizeForAudit((value.toJSON as () => unknown)())
    }
    const out: Record<string, Prisma.InputJsonValue | null> = {}
    for (const [key, inner] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeForAudit(inner)
    }
    return out as Prisma.InputJsonObject
  }
  return value as Prisma.InputJsonValue
}
