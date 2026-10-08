import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { signStudentAccessToken } from '../src/common/security/studentToken'
import { generateAcessToken } from '../src/common/security/token'
import { MatchingRepo } from '../src/modules/matching/matching.repository'
import { RecommendationsRepo } from '../src/modules/recommendations/recommendations.repository'
import { StudentsRepo } from '../src/modules/students/students.repository'
import StudentAuthRepo from '../src/modules/studentAuth/studentAuth.repository'
import StudentPortalRepo from '../src/modules/studentPortal/studentPortal.repository'
import { buildAdvisorLookup } from '../src/modules/team/advisor-lookup'
import { VisaRatesRepo } from '../src/modules/visaRates/visaRates.repository'
import { ConversationsRepo } from '../src/modules/conversations/conversations.repository'
import { ContactsRepo } from '../src/modules/contacts/contacts.repository'
import { StudentMessageService } from '../src/modules/conversations/studentMessage.service'
import { AdvisorRequestService } from '../src/modules/conversations/advisorRequest.service'
import { CentrifugoClient } from '../src/integrations/centrifugo/services/centrifugo.client'
import StudyPlanLinkRepo from '../src/modules/studyPlanLinks/studyPlanLinks.repository'
import { AuditRepo } from '../src/modules/audit/audit.repository'
import { hashOpaqueToken } from '../src/common/security/opaqueToken'

vi.mock('../src/modules/studentAuth/studentAuth.repository', () => ({
  default: { findSessionById: vi.fn() },
}))
vi.mock('../src/modules/studentPortal/studentPortal.repository', () => ({
  default: {
    findStudent: vi.fn(),
    countShortlist: vi.fn(),
    listApplicationStatuses: vi.fn(),
    findProgramForScoring: vi.fn(),
    findProgramById: vi.fn(),
    choose: vi.fn(),
    removeFromShortlist: vi.fn(),
    markStudyPlanShared: vi.fn(),
    findJourneyChecks: vi.fn(),
    setJourneyCheck: vi.fn(),
    clearJourneyCheck: vi.fn(),
  },
}))
vi.mock('../src/modules/studyPlanLinks/studyPlanLinks.repository', () => ({
  default: { create: vi.fn(), findLiveStudentId: vi.fn(), revokeAll: vi.fn() },
}))
vi.mock('../src/modules/recommendations/recommendations.repository', () => ({
  RecommendationsRepo: {
    getCurrentWeights: vi.fn(),
    findShortlistedProgramIds: vi.fn(),
    upsertShortlist: vi.fn(),
  },
}))
vi.mock('../src/modules/matching/matching.repository', () => ({
  MatchingRepo: { findMatchingPrograms: vi.fn() },
}))
vi.mock('../src/modules/visaRates/visaRates.repository', () => ({
  VisaRatesRepo: { findLatestActiveForCountries: vi.fn() },
}))
vi.mock('../src/modules/students/students.repository', () => ({
  StudentsRepo: { updateStudentPreferences: vi.fn() },
}))
vi.mock('../src/modules/team/advisor-lookup', () => ({ buildAdvisorLookup: vi.fn() }))
vi.mock('../src/modules/conversations/conversations.repository', () => ({
  ConversationsRepo: { findStudentMessages: vi.fn(), findCurrentConversation: vi.fn() },
}))
vi.mock('../src/modules/contacts/contacts.repository', () => ({
  ContactsRepo: { createStudentConversation: vi.fn() },
}))
vi.mock('../src/modules/conversations/studentMessage.service', () => ({
  StudentMessageService: { Receive: vi.fn() },
}))
vi.mock('../src/modules/conversations/advisorRequest.service', () => ({
  AdvisorRequestService: { Request: vi.fn() },
}))
vi.mock('../src/integrations/centrifugo/services/centrifugo.client', () => ({
  CentrifugoClient: { publish: vi.fn() },
}))

const portalRepo = vi.mocked(StudentPortalRepo)
const recRepo = vi.mocked(RecommendationsRepo)
const matchingRepo = vi.mocked(MatchingRepo)
const studentsRepo = vi.mocked(StudentsRepo)
const advisorLookup = vi.mocked(buildAdvisorLookup)

const STUDENT_ID = 'student-uuid'
const token = () => signStudentAccessToken(STUDENT_ID, 'session-uuid')
const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token()}`)

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  public_id: 'STU-6377',
  assigned_advisor_id: null,
  study_level: 'MASTERS',
  target_destinations: ['UK'],
  target_intake_month: 'SEPTEMBER',
  target_intake_year: 2027,
  budget_range: '25k',
  academic_background: 'BSc Computer Science, 2:1',
  english_test_score: 'IELTS 6.5',
  chosen_program_id: null,
  study_plan_shared_at: null,
  contact: { first_name: 'Emmanuel', last_name: 'Oyelowo', email: 'e@example.com' },
  identities: [{ email: 'e@example.com' }],
  conversations: [{ mode: 'AI_BOT' }],
  ...overrides,
})

const makeProgram = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `program-${n}`,
  public_id: `PRG-${1000 + n}`,
  name: `MSc Programme ${n}`,
  study_level: 'POSTGRADUATE',
  qualification: 'MSc',
  category: 'Data',
  duration: '1 year',
  tuition_amount: 10000 + n * 1000,
  tuition_currency: 'GBP',
  scholarship_availability: null,
  academic_requirements: null,
  english_requirements: null,
  school: { public_id: `SCH-${n}`, name: `School ${n}`, country: 'United Kingdom', city: 'Leeds', visa_friendliness_score: 70 },
  intakes: [
    { month: 'JANUARY', year: 2028, application_deadline: null },
    { month: 'SEPTEMBER', year: 2027, application_deadline: null },
  ],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(StudentAuthRepo).findSessionById.mockResolvedValue({
    id: 'session-uuid',
    student_id: STUDENT_ID,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000),
  } as never)
  portalRepo.findStudent.mockResolvedValue(makeStudent() as never)
  portalRepo.countShortlist.mockResolvedValue(0)
  portalRepo.listApplicationStatuses.mockResolvedValue([])
  portalRepo.findJourneyChecks.mockResolvedValue([])
  recRepo.getCurrentWeights.mockResolvedValue({
    version: 1,
    weights: { programWeight: 35, budgetWeight: 25, intakeWeight: 20, visaWeight: 20 },
  })
  recRepo.findShortlistedProgramIds.mockResolvedValue(new Set())
  vi.mocked(VisaRatesRepo).findLatestActiveForCountries.mockResolvedValue([])
  advisorLookup.mockResolvedValue(new Map())
})

describe('GET /api/v1/student/me', () => {
  it('returns the profile with no advisor', async () => {
    const res = await auth(request(app).get('/api/v1/student/me'))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      publicId: 'STU-6377',
      firstName: 'Emmanuel',
      fullName: 'Emmanuel Oyelowo',
      email: 'e@example.com',
      studyLevel: 'MASTERS',
      destinations: ['UK'],
      intake: { month: 'SEPTEMBER', year: 2027 },
      budgetRange: '25k',
      academicBackground: 'BSc Computer Science, 2:1',
      englishTest: 'IELTS 6.5',
      advisor: null,
      conversationMode: 'AI_BOT',
      telegramLinked: false,
    })
  })

  it('reports a linked Telegram account and keeps the Google email', async () => {
    portalRepo.findStudent.mockResolvedValue(
      makeStudent({
        identities: [
          { provider: 'TELEGRAM', email: null },
          { provider: 'GOOGLE', email: 'e@example.com' },
        ],
      }) as never,
    )
    const res = await auth(request(app).get('/api/v1/student/me'))
    expect(res.body.data).toMatchObject({ telegramLinked: true, email: 'e@example.com' })
  })

  it('shows the advisor as handling when the conversation is with them', async () => {
    portalRepo.findStudent.mockResolvedValue(
      makeStudent({ assigned_advisor_id: 'advisor-uuid', conversations: [{ mode: 'HUMAN_ADVISOR' }] }) as never,
    )
    advisorLookup.mockResolvedValue(new Map([['advisor-uuid', { publicId: 'USR-1', fullName: 'Amina Yusuf' }]]))

    const res = await auth(request(app).get('/api/v1/student/me'))
    expect(res.body.data.advisor).toEqual({ name: 'Amina Yusuf', handling: true })
    expect(res.body.data.conversationMode).toBe('HUMAN_ADVISOR')
  })
})

describe('PATCH /api/v1/student/me/profile', () => {
  it('saves the Telegram-style codes', async () => {
    const res = await auth(request(app).patch('/api/v1/student/me/profile')).send({
      studyLevel: 'MASTERS',
      destinations: ['UK', 'CANADA'],
      intake: { month: 'SEPTEMBER', year: 2027 },
      budgetRange: '£15k - £25k',
      academicBackground: 'BSc Computer Science, 2:1',
      englishTest: 'IELTS 6.5',
    })
    expect(res.status).toBe(200)
    expect(studentsRepo.updateStudentPreferences).toHaveBeenCalledWith(STUDENT_ID, {
      studyLevel: 'MASTERS',
      targetDestinations: ['UK', 'CANADA'],
      targetIntakeMonth: 'SEPTEMBER',
      targetIntakeYear: 2027,
      budgetRange: '£15k - £25k',
      academicBackground: 'BSc Computer Science, 2:1',
      englishTestScore: 'IELTS 6.5',
    })
  })

  it.each([
    ['an unknown study level', { studyLevel: 'MBA' }],
    ['an unknown destination', { destinations: ['MARS'] }],
    ['a year in the past', { intake: { month: 'SEPTEMBER', year: 2020 } }],
    ['an empty body', {}],
    ['a one-character academic background', { academicBackground: 'A' }],
  ])('rejects %s', async (_label, body) => {
    const res = await auth(request(app).patch('/api/v1/student/me/profile')).send(body)
    expect(res.status).toBe(400)
    expect(studentsRepo.updateStudentPreferences).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/student/journey', () => {
  it('reflects shortlist, choice and applications', async () => {
    portalRepo.countShortlist.mockResolvedValue(2)
    portalRepo.findStudent.mockResolvedValue(makeStudent({ chosen_program_id: 'program-1' }) as never)

    const choose = await auth(request(app).get('/api/v1/student/journey'))
    expect(choose.body.data.currentStage).toBe('CHOOSE')
    expect(choose.body.data.nextStep.title).toBe('Share your study plan')

    portalRepo.listApplicationStatuses.mockResolvedValue(['REJECTED', 'OFFER_RECEIVED'])
    const offer = await auth(request(app).get('/api/v1/student/journey'))
    expect(offer.body.data.currentStage).toBe('OFFER')
  })
})

describe('GET /api/v1/student/matches', () => {
  it('returns the top 10 by score, plus shortlisted and chosen programmes', async () => {
    // Tuition rises with n, so budget fit (and the overall score) falls as n grows.
    const programs = Array.from({ length: 14 }, (_, i) => makeProgram(i + 1))
    matchingRepo.findMatchingPrograms.mockResolvedValue(programs as never)
    recRepo.findShortlistedProgramIds.mockResolvedValue(new Set(['program-13']))
    portalRepo.findStudent.mockResolvedValue(makeStudent({ chosen_program_id: 'program-14' }) as never)

    const res = await auth(request(app).get('/api/v1/student/matches'))
    expect(res.status).toBe(200)
    const ids = res.body.data.map((m: { programmeId: string }) => m.programmeId)
    expect(ids).toHaveLength(12)
    expect(ids).toContain('PRG-1013')
    expect(ids).toContain('PRG-1014')
    expect(ids).not.toContain('PRG-1011')

    const scores = res.body.data.map((m: { scores: { overall: number } }) => m.scores.overall)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)

    const saved = res.body.data.find((m: { programmeId: string }) => m.programmeId === 'PRG-1013')
    expect(saved).toMatchObject({ shortlisted: true, chosen: false })
    expect(res.body.data.find((m: { programmeId: string }) => m.programmeId === 'PRG-1014').chosen).toBe(true)

    expect(res.body.data[0]).toMatchObject({
      duration: '1 year',
      intakes: ['September 2027', 'January 2028'],
      tuition: { amount: 11000, currency: 'GBP' },
      level: 'Postgraduate',
      country: 'United Kingdom',
    })
    expect(matchingRepo.findMatchingPrograms).toHaveBeenCalledWith({ countries: ['United Kingdom'], poolCap: 300 })
  })
})

describe('shortlist and choice', () => {
  it('404s when adding an unknown or inactive programme', async () => {
    portalRepo.findProgramForScoring.mockResolvedValue(null)
    const res = await auth(request(app).post('/api/v1/student/shortlist/PRG-9999'))
    expect(res.status).toBe(404)
    expect(portalRepo.findProgramForScoring).toHaveBeenCalledWith('PRG-9999', { activeOnly: true })
    expect(recRepo.upsertShortlist).not.toHaveBeenCalled()
  })

  it('adds to the shortlist and returns the scored programme', async () => {
    portalRepo.findProgramForScoring.mockResolvedValue(makeProgram(1) as never)
    recRepo.findShortlistedProgramIds.mockResolvedValue(new Set(['program-1']))

    const res = await auth(request(app).post('/api/v1/student/shortlist/PRG-1001'))
    expect(res.status).toBe(200)
    expect(recRepo.upsertShortlist).toHaveBeenCalledWith(STUDENT_ID, 'program-1')
    expect(res.body.data).toMatchObject({ programmeId: 'PRG-1001', shortlisted: true })
  })

  it('removes from the shortlist even if the school is now inactive', async () => {
    portalRepo.findProgramForScoring.mockResolvedValue(makeProgram(1) as never)

    const res = await auth(request(app).delete('/api/v1/student/shortlist/PRG-1001'))
    expect(res.status).toBe(200)
    expect(portalRepo.findProgramForScoring).toHaveBeenCalledWith('PRG-1001', { activeOnly: false })
    expect(portalRepo.removeFromShortlist).toHaveBeenCalledWith(STUDENT_ID, 'program-1')
  })

  it('chooses a programme and returns the journey', async () => {
    portalRepo.findProgramForScoring.mockResolvedValue(makeProgram(1) as never)
    portalRepo.countShortlist.mockResolvedValue(1)

    const res = await auth(request(app).post('/api/v1/student/choice')).send({ programId: 'PRG-1001' })
    expect(res.status).toBe(200)
    expect(portalRepo.choose).toHaveBeenCalledWith(STUDENT_ID, 'program-1')
    expect(res.body.data.currentStage).toBe('CHOOSE')
  })

  it('404s when choosing an unknown programme', async () => {
    portalRepo.findProgramForScoring.mockResolvedValue(null)
    const res = await auth(request(app).post('/api/v1/student/choice')).send({ programId: 'PRG-9999' })
    expect(res.status).toBe(404)
    expect(portalRepo.choose).not.toHaveBeenCalled()
  })
})

describe('study plan', () => {
  it('is null before a programme is chosen', async () => {
    const res = await auth(request(app).get('/api/v1/student/study-plan'))
    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })

  it('shows only real tuition once a programme is chosen', async () => {
    portalRepo.findStudent.mockResolvedValue(makeStudent({ chosen_program_id: 'program-1' }) as never)
    portalRepo.findProgramById.mockResolvedValue(makeProgram(1) as never)

    const res = await auth(request(app).get('/api/v1/student/study-plan'))
    expect(res.body.data.studentName).toBe('Emmanuel Oyelowo')
    expect(res.body.data.programme.programmeId).toBe('PRG-1001')
    expect(res.body.data.costBreakdown).toEqual([
      { label: 'Tuition (per year)', amount: { amount: 11000, currency: 'GBP' } },
    ])
    expect(res.body.data.total).toEqual({ amount: 11000, currency: 'GBP' })
  })

  it('creates a public link: stores only the hash and records the share', async () => {
    portalRepo.findStudent.mockResolvedValue(makeStudent({ chosen_program_id: 'program-1' }) as never)
    const expires = new Date('2026-12-28T00:00:00Z')
    vi.mocked(StudyPlanLinkRepo).create.mockResolvedValue({ expires_at: expires } as never)

    const res = await auth(request(app).post('/api/v1/student/study-plan/link'))

    expect(res.status).toBe(201)
    const url: string = res.body.data.url
    expect(url).toMatch(/^http:\/\/localhost:5174\/p\/[A-Za-z0-9_-]{43}$/)
    expect(res.body.data.expiresAt).toBe(expires.toISOString())
    const token = url.split('/p/')[1]!
    // The raw token never reaches the database, only its SHA-256.
    expect(vi.mocked(StudyPlanLinkRepo).create).toHaveBeenCalledWith(STUDENT_ID, hashOpaqueToken(token))
    expect(portalRepo.markStudyPlanShared).toHaveBeenCalledWith(STUDENT_ID)
  })

  it('refuses a link before a programme is chosen', async () => {
    const res = await auth(request(app).post('/api/v1/student/study-plan/link'))
    expect(res.status).toBe(409)
    expect(vi.mocked(StudyPlanLinkRepo).create).not.toHaveBeenCalled()
  })

  it('stops sharing by revoking every link', async () => {
    const res = await auth(request(app).delete('/api/v1/student/study-plan/link'))
    expect(res.status).toBe(200)
    expect(vi.mocked(StudyPlanLinkRepo).revokeAll).toHaveBeenCalledWith(STUDENT_ID)
  })
})

describe('GET /api/v1/public/study-plans/:token', () => {
  const TOKEN = 'a'.repeat(43)

  it('shows the live plan with the first name only, never cached or indexed', async () => {
    vi.mocked(StudyPlanLinkRepo).findLiveStudentId.mockResolvedValue(STUDENT_ID)
    portalRepo.findStudent.mockResolvedValue(makeStudent({ chosen_program_id: 'program-1' }) as never)
    portalRepo.findProgramById.mockResolvedValue(makeProgram(1) as never)

    const res = await request(app).get(`/api/v1/public/study-plans/${TOKEN}`)

    expect(res.status).toBe(200)
    expect(vi.mocked(StudyPlanLinkRepo).findLiveStudentId).toHaveBeenCalledWith(hashOpaqueToken(TOKEN))
    expect(res.body.data.studentFirstName).toBe('Emmanuel')
    expect(res.body.data.programme.programmeId).toBe('PRG-1001')
    const body = JSON.stringify(res.body)
    expect(body).not.toContain('Oyelowo')
    expect(body).not.toContain('e@example.com')
    expect(body).not.toContain('STU-6377')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-robots-tag']).toContain('noindex')
  })

  it('gives the same 404 for an unknown, expired or revoked link and for a plan with no choice', async () => {
    vi.mocked(StudyPlanLinkRepo).findLiveStudentId.mockResolvedValue(null)
    const dead = await request(app).get(`/api/v1/public/study-plans/${TOKEN}`)

    vi.mocked(StudyPlanLinkRepo).findLiveStudentId.mockResolvedValue(STUDENT_ID)
    const noChoice = await request(app).get(`/api/v1/public/study-plans/${TOKEN}`)

    expect(dead.status).toBe(404)
    expect(noChoice.status).toBe(404)
    expect(dead.body.error?.message ?? dead.body.message).toBe(noChoice.body.error?.message ?? noChoice.body.message)
  })

  it('rejects a malformed token without touching the database', async () => {
    const res = await request(app).get('/api/v1/public/study-plans/not-a-token')
    expect(res.status).toBe(400)
    expect(vi.mocked(StudyPlanLinkRepo).findLiveStudentId).not.toHaveBeenCalled()
  })
})

describe('journey checks', () => {
  const offerStage = () => {
    portalRepo.findStudent.mockResolvedValue(makeStudent({ english_test_score: 'Not taken yet' }) as never)
    portalRepo.listApplicationStatuses.mockResolvedValue(['OFFER_RECEIVED'])
  }

  it('shows which steps the student can tick', async () => {
    offerStage()
    const res = await auth(request(app).get('/api/v1/student/journey'))
    const funds = res.body.data.stages.find((s: { key: string }) => s.key === 'FUNDS')
    const offer = res.body.data.stages.find((s: { key: string }) => s.key === 'OFFER')
    expect(offer.checklist[1]).toMatchObject({ checkKey: 'DEPOSIT_PAID', canTick: true, done: false })
    expect(funds.checklist.every((item: { canTick: boolean }) => !item.canTick)).toBe(true)
  })

  it('ticks a step, audits it with no staff actor, and returns the new journey', async () => {
    offerStage()
    portalRepo.findJourneyChecks.mockResolvedValue(['DEPOSIT_PAID'])

    const res = await auth(request(app).put('/api/v1/student/journey/checks/DEPOSIT_PAID'))

    expect(res.status).toBe(200)
    expect(portalRepo.setJourneyCheck).toHaveBeenCalledWith(STUDENT_ID, 'DEPOSIT_PAID', null, expect.anything())
    expect(res.body.data.currentStage).toBe('ENGLISH')
    expect(vi.mocked(AuditRepo).record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'student.journey_check_set',
        entity_id: 'STU-6377',
        actor_id: null,
      }),
    )
  })

  it('unticks with DELETE', async () => {
    offerStage()
    const res = await auth(request(app).delete('/api/v1/student/journey/checks/ENGLISH_TEST_BOOKED'))
    expect(res.status).toBe(200)
    expect(portalRepo.clearJourneyCheck).toHaveBeenCalledWith(STUDENT_ID, 'ENGLISH_TEST_BOOKED', expect.anything())
    expect(vi.mocked(AuditRepo).record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'student.journey_check_cleared' }),
    )
  })

  it("403s on the advisor's proof-of-funds steps", async () => {
    const res = await auth(request(app).put('/api/v1/student/journey/checks/FUNDS_DOCUMENTS_READY'))
    expect(res.status).toBe(403)
    expect(portalRepo.setJourneyCheck).not.toHaveBeenCalled()
  })

  it('400s on an unknown key', async () => {
    const res = await auth(request(app).put('/api/v1/student/journey/checks/VISA_GRANTED'))
    expect(res.status).toBe(400)
  })
})

describe('chat', () => {
  const conversationsRepo = vi.mocked(ConversationsRepo)
  const messageService = vi.mocked(StudentMessageService)

  const makeMessage = (id: string, sender_type: string, content: string, channel = 'WEB') => ({
    id,
    conversation_id: 'conv-uuid',
    sender_type,
    content,
    channel,
    metadata: null,
    created_at: new Date('2026-09-28T10:00:00Z'),
  })

  beforeEach(() => {
    conversationsRepo.findCurrentConversation.mockResolvedValue({ id: 'conv-uuid', mode: 'AI_BOT' } as never)
    conversationsRepo.findStudentMessages.mockResolvedValue([])
  })

  it('returns the thread with sender names and channels', async () => {
    portalRepo.findStudent.mockResolvedValue(makeStudent({ assigned_advisor_id: 'advisor-uuid' }) as never)
    advisorLookup.mockResolvedValue(new Map([['advisor-uuid', { publicId: 'USR-1', fullName: 'Amina Yusuf' }]]))
    conversationsRepo.findStudentMessages.mockResolvedValue([
      makeMessage('m1', 'STUDENT', 'Hi', 'TELEGRAM'),
      makeMessage('m2', 'AGENT', 'Hello!', 'TELEGRAM'),
      makeMessage('m3', 'ADVISOR', 'Amina here.'),
    ] as never)

    const res = await auth(request(app).get('/api/v1/student/messages'))
    expect(res.status).toBe(200)
    expect(conversationsRepo.findStudentMessages).toHaveBeenCalledWith(STUDENT_ID, 50)
    expect(res.body.data.advisorHandling).toBe(false)
    expect(
      res.body.data.messages.map((m: { senderName: string | null; channel: string }) => [m.senderName, m.channel]),
    ).toEqual([
      [null, 'TELEGRAM'],
      ['Smetase AI', 'TELEGRAM'],
      ['Amina Yusuf', 'WEB'],
    ])
  })

  it('reports advisorHandling once an advisor has taken over', async () => {
    conversationsRepo.findCurrentConversation.mockResolvedValue({ id: 'conv-uuid', mode: 'HUMAN_ADVISOR' } as never)
    const res = await auth(request(app).get('/api/v1/student/messages'))
    expect(res.body.data.advisorHandling).toBe(true)
  })

  it('reports advisorRequested once the thread is flagged, while the AI keeps handling it', async () => {
    conversationsRepo.findCurrentConversation.mockResolvedValue({
      id: 'conv-uuid',
      mode: 'AI_BOT',
      status: 'ESCALATED',
    } as never)
    const res = await auth(request(app).get('/api/v1/student/messages'))
    expect(res.body.data.advisorRequested).toBe(true)
    expect(res.body.data.advisorHandling).toBe(false)

    conversationsRepo.findCurrentConversation.mockResolvedValue({
      id: 'conv-uuid',
      mode: 'AI_BOT',
      status: 'ACTIVE',
    } as never)
    const normal = await auth(request(app).get('/api/v1/student/messages'))
    expect(normal.body.data.advisorRequested).toBe(false)
  })

  it('reports awaitingReply while the AI owes a recent student message a reply', async () => {
    const recent = { ...makeMessage('m1', 'STUDENT', 'Hi'), created_at: new Date() }
    conversationsRepo.findStudentMessages.mockResolvedValue([recent] as never)
    const waiting = await auth(request(app).get('/api/v1/student/messages'))
    expect(waiting.body.data.awaitingReply).toBe(true)

    // Answered: the AI spoke last.
    conversationsRepo.findStudentMessages.mockResolvedValue([recent, makeMessage('m2', 'AGENT', 'Hello!')] as never)
    const answered = await auth(request(app).get('/api/v1/student/messages'))
    expect(answered.body.data.awaitingReply).toBe(false)

    // Too old: the job must have failed, so stop showing "typing".
    conversationsRepo.findStudentMessages.mockResolvedValue([makeMessage('m1', 'STUDENT', 'Hi')] as never)
    const stale = await auth(request(app).get('/api/v1/student/messages'))
    expect(stale.body.data.awaitingReply).toBe(false)

    // An advisor is handling it: no AI reply is coming.
    conversationsRepo.findStudentMessages.mockResolvedValue([recent] as never)
    conversationsRepo.findCurrentConversation.mockResolvedValue({ id: 'conv-uuid', mode: 'HUMAN_ADVISOR' } as never)
    const advisor = await auth(request(app).get('/api/v1/student/messages'))
    expect(advisor.body.data.awaitingReply).toBe(false)
  })

  it('sends a message on the web channel and returns just that message (the reply is queued)', async () => {
    messageService.Receive.mockResolvedValue({
      message: makeMessage('m1', 'STUDENT', 'Which schools fit me?'),
      replyQueued: true,
    } as never)

    const res = await auth(request(app).post('/api/v1/student/messages')).send({ content: '  Which schools fit me?  ' })
    expect(res.status).toBe(201)
    expect(messageService.Receive).toHaveBeenCalledWith({
      conversationId: 'conv-uuid',
      studentId: STUDENT_ID,
      text: 'Which schools fit me?',
      channel: 'WEB',
    })
    expect(res.body.data.messages.map((m: { id: string }) => m.id)).toEqual(['m1'])
    expect(vi.mocked(CentrifugoClient).publish).toHaveBeenCalledWith(
      'admin:dashboard',
      expect.objectContaining({ event: 'message.created' }),
    )
  })

  it('starts a new conversation when the last one was resolved', async () => {
    conversationsRepo.findCurrentConversation.mockResolvedValue(null)
    vi.mocked(ContactsRepo).createStudentConversation.mockResolvedValue({ id: 'new-conv-uuid' } as never)
    messageService.Receive.mockResolvedValue({
      message: makeMessage('m1', 'STUDENT', 'Hello again'),
      replyQueued: true,
    } as never)

    const res = await auth(request(app).post('/api/v1/student/messages')).send({ content: 'Hello again' })
    expect(res.status).toBe(201)
    expect(ContactsRepo.createStudentConversation).toHaveBeenCalledWith(STUDENT_ID)
    expect(messageService.Receive).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'new-conv-uuid' }))
  })

  it('requests an advisor on the web channel', async () => {
    portalRepo.findStudent.mockResolvedValue(makeStudent() as never)
    vi.mocked(AdvisorRequestService).Request.mockResolvedValue({ alreadyRequested: false })

    const res = await auth(request(app).post('/api/v1/student/advisor-request'))
    expect(res.status).toBe(200)
    expect(AdvisorRequestService.Request).toHaveBeenCalledWith(STUDENT_ID, 'WEB')
    expect(res.body.data).toEqual({ alreadyRequested: false })
  })

  it('treats a repeat advisor request as a no-op', async () => {
    portalRepo.findStudent.mockResolvedValue(makeStudent() as never)
    vi.mocked(AdvisorRequestService).Request.mockResolvedValue({ alreadyRequested: true })

    const res = await auth(request(app).post('/api/v1/student/advisor-request'))
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ alreadyRequested: true })
  })

  it('rejects an advisor request when the student no longer exists', async () => {
    portalRepo.findStudent.mockResolvedValue(null as never)
    const res = await auth(request(app).post('/api/v1/student/advisor-request'))
    expect(res.status).toBe(401)
    expect(AdvisorRequestService.Request).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', '   '],
    ['too long', 'x'.repeat(2001)],
  ])('rejects %s content', async (_label, content) => {
    const res = await auth(request(app).post('/api/v1/student/messages')).send({ content })
    expect(res.status).toBe(400)
    expect(messageService.Receive).not.toHaveBeenCalled()
  })
})

describe('authentication', () => {
  const routes: [string, string][] = [
    ['get', '/api/v1/student/messages'],
    ['post', '/api/v1/student/messages'],
    ['post', '/api/v1/student/advisor-request'],
    ['get', '/api/v1/student/me'],
    ['patch', '/api/v1/student/me/profile'],
    ['get', '/api/v1/student/journey'],
    ['get', '/api/v1/student/matches'],
    ['post', '/api/v1/student/shortlist/PRG-1001'],
    ['delete', '/api/v1/student/shortlist/PRG-1001'],
    ['post', '/api/v1/student/choice'],
    ['get', '/api/v1/student/study-plan'],
    ['post', '/api/v1/student/study-plan/link'],
    ['delete', '/api/v1/student/study-plan/link'],
    ['put', '/api/v1/student/journey/checks/DEPOSIT_PAID'],
    ['delete', '/api/v1/student/journey/checks/DEPOSIT_PAID'],
  ]

  it.each(routes)('%s %s needs a student token', async (method, path) => {
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path)
    expect(res.status).toBe(401)
  })

  it.each(routes)('%s %s rejects a staff token', async (method, path) => {
    const staff = generateAcessToken('user-uuid', 'session-uuid', 'ADMIN', 0)
    const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path).set(
      'Authorization',
      `Bearer ${staff}`,
    )
    expect(res.status).toBe(401)
    expect(portalRepo.findStudent).not.toHaveBeenCalled()
  })
})
