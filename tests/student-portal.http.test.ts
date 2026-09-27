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
  },
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
    })
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

  it('records a share', async () => {
    const res = await auth(request(app).post('/api/v1/student/study-plan/shared'))
    expect(res.status).toBe(200)
    expect(portalRepo.markStudyPlanShared).toHaveBeenCalledWith(STUDENT_ID)
  })
})

describe('authentication', () => {
  const routes: [string, string][] = [
    ['get', '/api/v1/student/me'],
    ['patch', '/api/v1/student/me/profile'],
    ['get', '/api/v1/student/journey'],
    ['get', '/api/v1/student/matches'],
    ['post', '/api/v1/student/shortlist/PRG-1001'],
    ['delete', '/api/v1/student/shortlist/PRG-1001'],
    ['post', '/api/v1/student/choice'],
    ['get', '/api/v1/student/study-plan'],
    ['post', '/api/v1/student/study-plan/shared'],
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
