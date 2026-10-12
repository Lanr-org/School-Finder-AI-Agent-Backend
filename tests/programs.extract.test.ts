import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { AiUsageService } from '../src/modules/ai/aiUsage.service'
import { llmClient } from '../src/integrations/llm/index'
import {
  assertFetchableUrl,
  htmlToText,
  isPublicAddress,
} from '../src/integrations/web/fetchPage'
import {
  ProgramExtractService,
  guardExtraction,
  normalizeAcademicYear,
  quoteHasAmount,
  type ExtractionOutput,
} from '../src/modules/programs/programs.extract'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: { findUser: vi.fn(), findAuthSessionById: vi.fn() },
}))
vi.mock('../src/modules/ai/aiUsage.service', () => ({
  AiUsageService: { TryConsumeGlobal: vi.fn() },
}))
vi.mock('../src/integrations/llm/index', () => ({
  llmClient: { generateReply: vi.fn() },
}))

// Shaped like the University of Hertfordshire course page (October 2026).
const PAGE = `Data Science and Analytics MSc
Study mode: Full Time
Duration: 1 Year
Start date: September 2026, January 2027
Fees and funding
2026/27 academic year
UK Students: Full time £10,500 for the course
International Students: Full time £19,950 for the course
Entry requirements
A minimum of a second-class honours degree (2:2) in a relevant subject.
IELTS 6.5 overall with no less than 5.5 in each band.`

const fullOutput = (): ExtractionOutput => ({
  name: {
    value: 'Data Science and Analytics',
    quote: 'Data Science and Analytics MSc',
  },
  studyLevel: {
    value: 'POSTGRADUATE',
    quote: 'Data Science and Analytics MSc',
  },
  qualification: { value: 'MSc', quote: 'Data Science and Analytics MSc' },
  duration: { value: '1 year full-time', quote: 'Duration: 1 Year' },
  tuitionAmount: {
    value: 19950,
    quote: 'International Students: Full time £19,950 for the course',
  },
  tuitionCurrency: {
    value: 'GBP',
    quote: 'International Students: Full time £19,950 for the course',
  },
  feePeriod: {
    value: 'TOTAL',
    quote: 'International Students: Full time £19,950 for the course',
  },
  feesAcademicYear: { value: '2026/27', quote: '2026/27 academic year' },
  intakes: [
    {
      month: 'SEPTEMBER',
      year: 2026,
      quote: 'Start date: September 2026, January 2027',
    },
    {
      month: 'JANUARY',
      year: 2027,
      quote: 'Start date: September 2026, January 2027',
    },
  ],
  academicRequirements: {
    value:
      'A minimum of a second-class honours degree (2:2) in a relevant subject.',
    quote:
      'A minimum of a second-class honours degree (2:2) in a relevant subject.',
  },
  englishRequirements: {
    value: 'IELTS 6.5 overall with no less than 5.5 in each band.',
    quote: 'IELTS 6.5 overall with no less than 5.5 in each band.',
  },
  scholarshipAvailability: null,
})

const authRepoMock = vi.mocked(AuthRepo)
const llmMock = vi.mocked(llmClient)
const aiUsageMock = vi.mocked(AiUsageService)

const OCT_2026 = new Date('2026-10-10T12:00:00Z')

describe('guardExtraction', () => {
  it('keeps every value whose quote is on the page, with its evidence', () => {
    const result = guardExtraction(fullOutput(), PAGE, OCT_2026)
    expect(result.draft).toEqual({
      name: 'Data Science and Analytics',
      studyLevel: 'POSTGRADUATE',
      qualification: 'MSc',
      duration: '1 year full-time',
      tuitionAmount: 19950,
      tuitionCurrency: 'GBP',
      feesAcademicYear: '2026/27',
      intakes: [
        { month: 'SEPTEMBER', year: 2026 },
        { month: 'JANUARY', year: 2027 },
      ],
      academicRequirements:
        'A minimum of a second-class honours degree (2:2) in a relevant subject.',
      englishRequirements:
        'IELTS 6.5 overall with no less than 5.5 in each band.',
    })
    expect(result.evidence['tuitionAmount']).toContain('£19,950')
    expect(result.evidence['intakes.1']).toContain('January 2027')
    expect(result.dropped).toEqual([])
    expect(result.warnings).toEqual([
      'The fee is for the whole course; the form stores the fee per year.',
    ])
  })

  it('tolerates curly quotes, dashes and spacing differences in the quote', () => {
    const output = fullOutput()
    output.tuitionAmount = {
      value: 19950,
      quote: 'International  Students:  Full time £ 19,950 for the course',
    }
    expect(guardExtraction(output, PAGE, OCT_2026).draft.tuitionAmount).toBe(
      19950,
    )
  })

  it('drops an invented fee whose quote is not on the page', () => {
    const output = fullOutput()
    output.tuitionAmount = {
      value: 23000,
      quote: 'International Students: £23,000 per year',
    }
    const result = guardExtraction(output, PAGE, OCT_2026)
    expect(result.draft.tuitionAmount).toBeUndefined()
    expect(result.dropped).toContain('tuitionAmount')
  })

  it('drops a fee whose number is not in its (real) quote', () => {
    const output = fullOutput()
    output.tuitionAmount = {
      value: 21000,
      quote: 'International Students: Full time £19,950 for the course',
    }
    expect(guardExtraction(output, PAGE, OCT_2026).dropped).toContain(
      'tuitionAmount',
    )
  })

  it('drops a course name that is not on the page, even with a real quote', () => {
    const output = fullOutput()
    output.name = {
      value: 'Applied Data Science',
      quote: 'Data Science and Analytics MSc',
    }
    expect(guardExtraction(output, PAGE, OCT_2026).dropped).toContain('name')
  })

  it('drops reworded requirements even when the quote is real', () => {
    const output = fullOutput()
    output.englishRequirements = {
      value: 'IELTS 6.0 overall is accepted.',
      quote: 'IELTS 6.5 overall with no less than 5.5 in each band.',
    }
    expect(guardExtraction(output, PAGE, OCT_2026).dropped).toContain(
      'englishRequirements',
    )
  })

  it('drops an intake whose month is not in its quote, or has no stated year', () => {
    const output = fullOutput()
    output.intakes = [
      {
        month: 'MAY',
        year: 2027,
        quote: 'Start date: September 2026, January 2027',
      },
      {
        month: 'SEPTEMBER',
        year: null,
        quote: 'Start date: September 2026, January 2027',
      },
    ]
    const result = guardExtraction(output, PAGE, OCT_2026)
    expect(result.draft.intakes).toBeUndefined()
    expect(result.dropped).toContain('intakes')
  })

  it('warns about old fees and fees without a year', () => {
    const page = `${PAGE}\nFees for 2025/26 entry`
    const output = fullOutput()
    output.feesAcademicYear = {
      value: '2025/26',
      quote: 'Fees for 2025/26 entry',
    }
    expect(guardExtraction(output, page, OCT_2026).warnings).toContain(
      'The fees are for 2025/26, an earlier year. Look for newer fees.',
    )

    output.feesAcademicYear = null
    expect(guardExtraction(output, PAGE, OCT_2026).warnings).toContain(
      'The page does not say which year the fee is for.',
    )
  })

  it('flags a fee quote that does not say it is the international fee', () => {
    const page = 'Tuition fee: £19,950 per year for this course.'
    const result = guardExtraction(
      {
        tuitionAmount: { value: 19950, quote: 'Tuition fee: £19,950 per year' },
      },
      page,
      OCT_2026,
    )
    expect(result.draft.tuitionAmount).toBe(19950)
    expect(result.warnings[0]).toMatch(/international fee/)
  })
})

describe('helpers', () => {
  it('reads amounts in UK and European formats', () => {
    expect(quoteHasAmount('£19,950 per year', 19950)).toBe(true)
    expect(quoteHasAmount('€ 1.500,00 per semester', 1500)).toBe(true)
    expect(quoteHasAmount('£19,950 per year', 1995)).toBe(false)
  })

  it('normalises academic years', () => {
    expect(normalizeAcademicYear('2026-27')).toBe('2026/27')
    expect(normalizeAcademicYear('2026/2027')).toBe('2026/27')
    expect(normalizeAcademicYear('2026 to 2027')).toBe('2026/27')
    expect(normalizeAcademicYear('2026 entry')).toBe('2026/27')
    expect(normalizeAcademicYear('2026/29')).toBeNull()
  })

  it('turns HTML into readable text and drops scripts and navigation', () => {
    const text = htmlToText(
      '<nav>Menu</nav><h1>Data Science MSc</h1><script>var x=1</script><table><tr><td>International</td><td>&pound;19,950</td></tr></table><p>Fees&nbsp;2026&#47;27</p>',
    )
    expect(text).toBe('Data Science MSc\nInternational £19,950\nFees 2026/27')
  })

  it('only reads public https addresses', () => {
    expect(() => assertFetchableUrl('http://www.herts.ac.uk/course')).toThrow(
      /https/,
    )
    expect(() => assertFetchableUrl('https://localhost/admin')).toThrow()
    expect(() =>
      assertFetchableUrl('https://169.254.169.254/latest/meta-data'),
    ).toThrow()
    expect(() => assertFetchableUrl('https://[::1]/')).toThrow()
    expect(assertFetchableUrl('https://www.herts.ac.uk/course').hostname).toBe(
      'www.herts.ac.uk',
    )
    expect(isPublicAddress('10.1.2.3')).toBe(false)
    expect(isPublicAddress('192.168.0.10')).toBe(false)
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
    expect(isPublicAddress('151.101.0.81')).toBe(true)
  })
})

describe('ProgramExtractService.ExtractDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiUsageMock.TryConsumeGlobal.mockResolvedValue({ allowed: true } as never)
  })

  it('reads pasted text and returns the guarded draft', async () => {
    llmMock.generateReply.mockResolvedValue(
      `\`\`\`json\n${JSON.stringify(fullOutput())}\n\`\`\``,
    )
    const result = await ProgramExtractService.ExtractDraft({
      url: 'https://www.herts.ac.uk/course/data-science',
      pageText: PAGE,
    })
    expect(result.sourceUrl).toBe('https://www.herts.ac.uk/course/data-science')
    expect(result.draft.tuitionAmount).toBe(19950)
  })

  it('returns a friendly error when the model reply is unusable', async () => {
    llmMock.generateReply.mockResolvedValue('Sorry, I cannot help with that.')
    await expect(
      ProgramExtractService.ExtractDraft({ pageText: PAGE }),
    ).rejects.toMatchObject({ statusCode: 500 })
  })

  it('stops at the daily AI limit', async () => {
    aiUsageMock.TryConsumeGlobal.mockResolvedValue({ allowed: false } as never)
    await expect(
      ProgramExtractService.ExtractDraft({ pageText: PAGE }),
    ).rejects.toMatchObject({ statusCode: 429 })
    expect(llmMock.generateReply.mock.calls).toHaveLength(0)
  })

  it('tells the user to paste the text when the link cannot be read', async () => {
    await expect(
      ProgramExtractService.ExtractDraft({ url: 'https://127.0.0.1/' }),
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { url: [expect.any(String)] },
    })
  })
})

describe('POST /api/v1/programs/extract', () => {
  const signIn = (role: 'ADVISOR' | 'OPERATIONS') => {
    authRepoMock.findUser.mockResolvedValue({
      id: 'u1',
      public_id: 'USR-0001',
      full_name: 'Staff Member',
      email: 'staff@example.com',
      phone: null,
      password_hash: 'x',
      role,
      status: 'ACTIVE',
      token_version: 0,
      last_login_at: null,
      password_changed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as never)
    authRepoMock.findAuthSessionById.mockResolvedValue({
      id: 's1',
      user_id: 'u1',
      refresh_token_hash: 'h',
      token_family: 'f',
      user_agent: null,
      ip_address: null,
      expires_at: new Date(Date.now() + 3_600_000),
      revoked_at: null,
      last_used_at: null,
      created_at: new Date(),
    })
    return `Bearer ${generateAcessToken('u1', 's1', role, 0)}`
  }

  beforeEach(() => {
    vi.clearAllMocks()
    aiUsageMock.TryConsumeGlobal.mockResolvedValue({ allowed: true } as never)
  })

  it('forbids advisors', async () => {
    const res = await request(app)
      .post('/api/v1/programs/extract')
      .set('Authorization', signIn('ADVISOR'))
      .send({ pageText: PAGE })
    expect(res.status).toBe(403)
    expect(llmMock.generateReply.mock.calls).toHaveLength(0)
  })

  it('needs a link or page text', async () => {
    const res = await request(app)
      .post('/api/v1/programs/extract')
      .set('Authorization', signIn('OPERATIONS'))
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns the draft, evidence and dropped fields', async () => {
    llmMock.generateReply.mockResolvedValue(JSON.stringify(fullOutput()))
    const res = await request(app)
      .post('/api/v1/programs/extract')
      .set('Authorization', signIn('OPERATIONS'))
      .send({ pageText: PAGE })
    const body = res.body as {
      data: {
        draft: Record<string, unknown>
        evidence: Record<string, string>
        dropped: string[]
      }
    }
    expect(res.status).toBe(200)
    expect(body.data.draft['tuitionAmount']).toBe(19950)
    expect(body.data.evidence['feesAcademicYear']).toBe('2026/27 academic year')
    expect(body.data.dropped).toEqual([])
  })
})
