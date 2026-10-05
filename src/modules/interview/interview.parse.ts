import type { ZodType } from 'zod'

// Models sometimes wrap JSON in ```fences``` or add a sentence around it. Pull out the first
// {...} block, then validate. Returns null on anything unusable.
export const parseModelJson = <T>(raw: string, schema: ZodType<T>): T | null => {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const result = schema.safeParse(JSON.parse(raw.slice(start, end + 1)))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
