import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashOpaqueToken } from '../src/common/security/opaqueToken'
import env from '../src/config/env'
import { AuditRepo } from '../src/modules/audit/audit.repository'
import { mergeStudents } from '../src/modules/studentLink/studentLink.merge'
import StudentLinkRepo from '../src/modules/studentLink/studentLink.repository'
import StudentLinkService from '../src/modules/studentLink/studentLink.service'

vi.mock('../src/modules/studentLink/studentLink.repository', () => ({
  default: {
    createToken: vi.fn(),
    redeemToken: vi.fn(),
    findIdentity: vi.fn(),
    findStudentIdentity: vi.fn(),
    addIdentity: vi.fn(),
  },
}))
vi.mock('../src/modules/studentLink/studentLink.merge', () => ({ mergeStudents: vi.fn() }))

const repo = vi.mocked(StudentLinkRepo)
const merge = vi.mocked(mergeStudents)

beforeEach(() => {
  vi.clearAllMocks()
  repo.findIdentity.mockResolvedValue(null)
  repo.findStudentIdentity.mockResolvedValue(null)
  repo.addIdentity.mockResolvedValue({ student: { public_id: 'STU-6377' } } as never)
})

describe('StudentLinkService.LinkTelegram', () => {
  it('redeems the hashed token for a Telegram account', async () => {
    repo.redeemToken.mockResolvedValue('web-student')
    await StudentLinkService.LinkTelegram('raw-token', '2011329752')
    expect(repo.redeemToken).toHaveBeenCalledWith(hashOpaqueToken('raw-token'), 'TELEGRAM')
  })

  it('reports an unknown, expired or used token', async () => {
    repo.redeemToken.mockResolvedValue(null)
    expect(await StudentLinkService.LinkTelegram('bad', '2011329752')).toEqual({
      outcome: 'INVALID_TOKEN',
      studentId: null,
    })
    expect(repo.addIdentity).not.toHaveBeenCalled()
  })

  it('attaches a new Telegram account to the web student and audits it', async () => {
    repo.redeemToken.mockResolvedValue('web-student')

    const result = await StudentLinkService.LinkTelegram('raw-token', '2011329752')

    expect(result).toEqual({ outcome: 'LINKED', studentId: 'web-student' })
    expect(repo.addIdentity).toHaveBeenCalledWith('web-student', 'TELEGRAM', '2011329752', null, expect.anything())
    expect(vi.mocked(AuditRepo).record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'student.identity_linked', entity_id: 'STU-6377', actor_id: null }),
    )
  })

  it('does nothing when the account is already on this student', async () => {
    repo.redeemToken.mockResolvedValue('web-student')
    repo.findIdentity.mockResolvedValue({ student_id: 'web-student' } as never)

    expect(await StudentLinkService.LinkTelegram('raw-token', '2011329752')).toEqual({
      outcome: 'ALREADY_LINKED',
      studentId: 'web-student',
    })
    expect(merge).not.toHaveBeenCalled()
  })

  it("merges when the Telegram account already has its own student", async () => {
    repo.redeemToken.mockResolvedValue('web-student')
    repo.findIdentity.mockResolvedValue({ student_id: 'telegram-student' } as never)
    merge.mockResolvedValue({ outcome: 'MERGED', survivorId: 'telegram-student' })

    const result = await StudentLinkService.LinkTelegram('raw-token', '2011329752')

    expect(merge).toHaveBeenCalledWith('telegram-student', 'web-student')
    expect(result).toEqual({ outcome: 'MERGED', studentId: 'telegram-student' })
  })

  it('reports a refused merge', async () => {
    repo.redeemToken.mockResolvedValue('web-student')
    repo.findIdentity.mockResolvedValue({ student_id: 'telegram-student' } as never)
    merge.mockResolvedValue({ outcome: 'REFUSED', reason: 'BOTH_HAVE_STAFF_WORK' })

    expect((await StudentLinkService.LinkTelegram('raw-token', '2011329752')).outcome).toBe('REFUSED')
  })

  it('refuses when the student already has a different Telegram account', async () => {
    repo.redeemToken.mockResolvedValue('web-student')
    repo.findStudentIdentity.mockResolvedValue({ subject: '999' } as never)

    expect((await StudentLinkService.LinkTelegram('raw-token', '2011329752')).outcome).toBe('REFUSED')
    expect(repo.addIdentity).not.toHaveBeenCalled()
  })
})

describe('StudentLinkService.LinkGoogle', () => {
  it('redeems a GOOGLE token and stores the Google email', async () => {
    repo.redeemToken.mockResolvedValue('telegram-student')

    await StudentLinkService.LinkGoogle('raw-token', {
      subject: 'google-sub',
      email: 'tobi@example.com',
      givenName: 'Tobi',
      familyName: null,
    })

    expect(repo.redeemToken).toHaveBeenCalledWith(hashOpaqueToken('raw-token'), 'GOOGLE')
    expect(repo.addIdentity).toHaveBeenCalledWith(
      'telegram-student',
      'GOOGLE',
      'google-sub',
      'tobi@example.com',
      expect.anything(),
    )
  })
})

describe('link creation', () => {
  it('builds a t.me deep link and stores only the hash', async () => {
    env.telegramBotUsername = 'SmetaseBot'
    repo.createToken.mockResolvedValue({ expires_at: new Date('2026-09-28T12:15:00Z') } as never)

    const { url } = await StudentLinkService.CreateTelegramLink('web-student')

    const token = url.replace('https://t.me/SmetaseBot?start=link_', '')
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(url.length - 'https://t.me/SmetaseBot?start='.length).toBeLessThanOrEqual(64)
    expect(repo.createToken).toHaveBeenCalledWith('web-student', hashOpaqueToken(token), 'TELEGRAM')
  })

  it('fails clearly when the bot username is not configured', async () => {
    env.telegramBotUsername = undefined
    await expect(StudentLinkService.CreateTelegramLink('web-student')).rejects.toMatchObject({ statusCode: 500 })
  })

  it('builds a web link page URL for the bot', async () => {
    repo.createToken.mockResolvedValue({} as never)
    const url = await StudentLinkService.CreateWebLink('telegram-student')
    expect(url).toMatch(/^http:\/\/localhost:5174\/link\/[A-Za-z0-9_-]{43}$/)
    expect(repo.createToken).toHaveBeenCalledWith('telegram-student', expect.any(String), 'GOOGLE')
  })
})
