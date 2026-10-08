import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '../src/generated/prisma/client'
import {
  BootstrapRefusedError,
  bootstrapAdmin,
} from '../src/common/bootstrap/bootstrapAdmin'
import {
  seedRecommendationWeights,
  seedSettingGroups,
} from '../src/database/referenceData'
import { hashPassword } from '../src/common/security/password'

vi.mock('../src/database/referenceData', () => ({
  seedSettingGroups: vi.fn(),
  seedRecommendationWeights: vi.fn(),
}))
vi.mock('../src/common/security/password', () => ({
  hashPassword: vi.fn(() => Promise.resolve('$argon2id$hashed')),
}))

const users = {
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}
const prisma = { users } as unknown as PrismaClient
const log = vi.fn()

const input = {
  email: '  Boss@Example.COM ',
  fullName: ' Ada Admin ',
  password: 'Str0ng-Passw0rd!',
}

beforeEach(() => {
  vi.clearAllMocks()
  users.findFirst.mockResolvedValue(null)
  users.findUnique.mockResolvedValue(null)
  users.create.mockImplementation(({ data }: { data: { email: string; public_id: string } }) =>
    Promise.resolve({ email: data.email, public_id: data.public_id }),
  )
})

describe('bootstrapAdmin', () => {
  it('creates an active admin with a hashed password and seeds the reference data', async () => {
    const admin = await bootstrapAdmin(prisma, input, log)

    expect(admin.email).toBe('boss@example.com')
    expect(admin.public_id).toMatch(/^USR-[0-9A-F]{12}$/)
    expect(hashPassword).toHaveBeenCalledWith('Str0ng-Passw0rd!')
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'boss@example.com',
          full_name: 'Ada Admin',
          password_hash: '$argon2id$hashed',
          role: 'ADMIN',
          status: 'ACTIVE',
        }) as unknown,
      }),
    )
    expect(seedSettingGroups).toHaveBeenCalledTimes(1)
    expect(seedRecommendationWeights).toHaveBeenCalledTimes(1)
  })

  it('never stores or logs the plain password', async () => {
    await bootstrapAdmin(prisma, input, log)

    const stored = JSON.stringify(users.create.mock.calls)
    expect(stored).not.toContain('Str0ng-Passw0rd!')
    expect(JSON.stringify(log.mock.calls)).not.toContain('Str0ng-Passw0rd!')
  })

  it('refuses when any admin already exists, and changes nothing', async () => {
    users.findFirst.mockResolvedValue({ email: 'first@example.com' })

    await expect(bootstrapAdmin(prisma, input, log)).rejects.toBeInstanceOf(BootstrapRefusedError)

    expect(users.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'ADMIN' } }))
    expect(users.create).not.toHaveBeenCalled()
    expect(seedSettingGroups).not.toHaveBeenCalled()
  })

  it('refuses when the email already belongs to a non-admin, rather than promoting them', async () => {
    users.findUnique.mockResolvedValue({ id: 'u1' })

    await expect(bootstrapAdmin(prisma, input, log)).rejects.toBeInstanceOf(BootstrapRefusedError)

    expect(users.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'boss@example.com' } }))
    expect(users.create).not.toHaveBeenCalled()
  })

  it.each([
    ['too short', 'Sh0rt!'],
    ['no uppercase', 'alllowercase-1234'],
    ['no lowercase', 'ALLUPPERCASE-1234'],
    ['no number', 'NoNumbers-Here-Please'],
  ])('rejects a weak password (%s) before touching the database', async (_label, password) => {
    await expect(bootstrapAdmin(prisma, { ...input, password }, log)).rejects.toThrow()

    expect(users.findFirst).not.toHaveBeenCalled()
    expect(users.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid email or a one-letter name', async () => {
    await expect(bootstrapAdmin(prisma, { ...input, email: 'not-an-email' }, log)).rejects.toThrow()
    await expect(bootstrapAdmin(prisma, { ...input, fullName: 'A' }, log)).rejects.toThrow()
    expect(users.create).not.toHaveBeenCalled()
  })
})
