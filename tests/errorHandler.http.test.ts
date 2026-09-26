import './setup-env'
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createError } from '../src/common/errors/AppError'
import { errorHandler } from '../src/middleware/errorHandler'
import { validate } from '../src/middleware/validate'

// Tests run with NODE_ENV=test — i.e. the non-development behaviour that
// production also gets.
const schema = z
  .object({
    email: z.string().email('Must be a valid email address'),
    intakes: z
      .array(z.object({ year: z.number().int().min(2000, 'Year too early') }))
      .optional(),
    fullName: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.fullName !== undefined || data.phone !== undefined, {
    message: 'At least one of fullName or phone is required',
  })

const app = express()
app.use(express.json())
app.post('/validate', validate(schema), (_req, res) => {
  res.json({ ok: true })
})
app.get('/conflict', () => {
  throw createError(
    'Cannot move DRAFT to DRAFT',
    409,
    { allowed: ['SUBMITTED'] },
    'CONFLICT',
  )
})
app.get('/not-found', () => {
  throw createError('Student not found', 404, {}, 'NOT_FOUND')
})
app.get('/server-error', () => {
  throw createError(
    'Error hashing token',
    500,
    { stack: 'Error: secret stack\n at x' },
    'INTERNAL_ERROR',
  )
})
app.use(errorHandler)

type ErrorBody = {
  success: false
  error: { code: string; message: string; details?: unknown }
}

const body = (res: { body: unknown }) => res.body as ErrorBody

describe('errorHandler + validate', () => {
  it('returns validation errors as an AGENTS.md field map outside development', async () => {
    const res = await request(app)
      .post('/validate')
      .send({
        email: 'not-an-email',
        intakes: [{ year: 1999 }],
        fullName: 'Ada',
      })

    expect(res.status).toBe(400)
    expect(body(res).error.code).toBe('VALIDATION_ERROR')
    expect(body(res).error.details).toEqual({
      email: ['Must be a valid email address'],
      'intakes.0.year': ['Year too early'],
    })
  })

  it('puts errors not tied to a field under _form', async () => {
    const res = await request(app).post('/validate').send({ email: 'a@b.com' })

    expect(res.status).toBe(400)
    expect(body(res).error.details).toEqual({
      _form: ['At least one of fullName or phone is required'],
    })
  })

  it('includes conflict context on 4xx errors', async () => {
    const res = await request(app).get('/conflict')

    expect(res.status).toBe(409)
    expect(body(res).error.details).toEqual({ allowed: ['SUBMITTED'] })
  })

  it('omits empty details', async () => {
    const res = await request(app).get('/not-found')

    expect(res.status).toBe(404)
    expect(body(res).error).not.toHaveProperty('details')
  })

  it('never sends 5xx details (they can contain stack traces) outside development', async () => {
    const res = await request(app).get('/server-error')

    expect(res.status).toBe(500)
    expect(body(res).error).not.toHaveProperty('details')
    expect(JSON.stringify(res.body)).not.toContain('secret stack')
  })
})
