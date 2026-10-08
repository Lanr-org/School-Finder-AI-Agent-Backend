import './setup-env'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InterviewService from '../src/modules/interview/interview.service'
import InterviewRepo from '../src/modules/interview/interview.repository'
import StudentPortalRepo from '../src/modules/studentPortal/studentPortal.repository'
import { AiUsageService } from '../src/modules/ai/aiUsage.service'
import { llmClient } from '../src/integrations/llm/index'

vi.mock('../src/modules/interview/interview.repository', () => ({
  default: {
    findActive: vi.fn(),
    findOwned: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    recordAnswer: vi.fn(),
    abandon: vi.fn(),
  },
  isUniqueViolation: vi.fn(() => false),
}))
vi.mock('../src/modules/studentPortal/studentPortal.repository', () => ({
  default: { findStudent: vi.fn(), findProgramById: vi.fn() },
}))
vi.mock('../src/modules/ai/aiUsage.service', () => ({
  AiUsageService: { TryConsumeGlobal: vi.fn(), TryConsumeInterviewSession: vi.fn() },
}))
vi.mock('../src/integrations/llm/index', () => ({ llmClient: { generateReply: vi.fn() } }))

const repo = vi.mocked(InterviewRepo)
const portalRepo = vi.mocked(StudentPortalRepo)
const usage = vi.mocked(AiUsageService)
const generate = vi.fn<(...args: unknown[]) => Promise<string>>()
vi.mocked(llmClient).generateReply = generate

const student = { id: 's1', study_level: 'MASTERS', target_destinations: ['UK'], chosen_program_id: null }

const answerRow = (idx: number, answer: string | null) => ({
  id: `a${idx}`,
  session_id: 'sess',
  idx,
  question: `Q${idx + 1}`,
  answer,
  tip: null,
  score: null,
  answered_at: null,
})

const session = (answers: ReturnType<typeof answerRow>[], overrides = {}) => ({
  id: 'sess',
  student_id: 's1',
  type: 'VISA',
  status: 'IN_PROGRESS',
  channel: 'WEB',
  target_country: 'UK',
  program_label: null,
  question_count: 5,
  overall_score: null,
  summary: null,
  strengths: null,
  improvements: null,
  created_at: new Date(),
  completed_at: null,
  answers,
  ...overrides,
})

beforeEach(() => {
  vi.resetAllMocks()
  usage.TryConsumeGlobal.mockResolvedValue({ allowed: true })
  usage.TryConsumeInterviewSession.mockResolvedValue({ allowed: true })
  portalRepo.findStudent.mockResolvedValue(student as never)
})

describe('InterviewService.Start', () => {
  it('asks the model for question 1 and saves the session', async () => {
    repo.findActive.mockResolvedValue(null)
    generate.mockResolvedValue('{"question":"Why do you want to study in the UK?"}')
    repo.create.mockResolvedValue(session([answerRow(0, null)]) as never)

    const turn = await InterviewService.Start('s1', 'VISA', 'WEB')

    expect(turn).toEqual({
      sessionId: 'sess',
      feedback: null,
      nextQuestion: { index: 0, text: 'Why do you want to study in the UK?' },
      result: null,
    })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: 's1', type: 'VISA', targetCountry: 'UK', questionCount: 5 }),
    )
  })

  it('refuses when an interview is already running', async () => {
    repo.findActive.mockResolvedValue(session([answerRow(0, null)]) as never)

    await expect(InterviewService.Start('s1', 'VISA', 'WEB')).rejects.toMatchObject({ statusCode: 409 })
    expect(generate).not.toHaveBeenCalled()
  })

  it('refuses at the daily session limit without calling the model', async () => {
    repo.findActive.mockResolvedValue(null)
    usage.TryConsumeInterviewSession.mockResolvedValue({ allowed: false, reason: 'STUDENT_DAILY' })

    await expect(InterviewService.Start('s1', 'ADMISSION', 'WEB')).rejects.toMatchObject({ statusCode: 429 })
    expect(generate).not.toHaveBeenCalled()
  })

  it('saves nothing when the model reply is not usable JSON', async () => {
    repo.findActive.mockResolvedValue(null)
    generate.mockResolvedValue('sorry, no JSON')

    await expect(InterviewService.Start('s1', 'VISA', 'WEB')).rejects.toMatchObject({ statusCode: 500 })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('stops at the global AI cap', async () => {
    repo.findActive.mockResolvedValue(null)
    usage.TryConsumeGlobal.mockResolvedValue({ allowed: false, reason: 'GLOBAL_DAILY' })

    await expect(InterviewService.Start('s1', 'VISA', 'WEB')).rejects.toMatchObject({ statusCode: 429 })
    expect(generate).not.toHaveBeenCalled()
  })
})

describe('InterviewService.SubmitAnswer', () => {
  it('records the answer with tip and score and returns the next question', async () => {
    repo.findOwned.mockResolvedValue(session([answerRow(0, null)]) as never)
    generate.mockResolvedValue('{"tip":"Be more specific.","score":6,"nextQuestion":"Who is funding you?"}')
    repo.recordAnswer.mockResolvedValue(true)

    const turn = await InterviewService.SubmitAnswer('s1', 'sess', 'Because it is good')

    expect(turn).toEqual({
      sessionId: 'sess',
      feedback: { tip: 'Be more specific.', score: 6, sampleAnswer: null },
      nextQuestion: { index: 1, text: 'Who is funding you?' },
      result: null,
    })
    expect(repo.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ answerId: 'a0', idx: 0, nextQuestion: 'Who is funding you?' }),
    )
  })

  it('gives and saves a sample answer for a weak answer', async () => {
    repo.findOwned.mockResolvedValue(session([answerRow(0, null)]) as never)
    generate.mockResolvedValue(
      '{"tip":"Too vague.","score":3,"sampleAnswer":"I chose [your course] because...","nextQuestion":"Who funds you?"}',
    )
    repo.recordAnswer.mockResolvedValue(true)

    const turn = await InterviewService.SubmitAnswer('s1', 'sess', 'idk')

    expect(turn.feedback?.sampleAnswer).toBe('I chose [your course] because...')
    expect(repo.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ sampleAnswer: 'I chose [your course] because...' }),
    )
  })

  it('drops a sample answer the model sent for a good answer', async () => {
    repo.findOwned.mockResolvedValue(session([answerRow(0, null)]) as never)
    generate.mockResolvedValue(
      '{"tip":"Great.","score":9,"sampleAnswer":"Unneeded example","nextQuestion":"Who funds you?"}',
    )
    repo.recordAnswer.mockResolvedValue(true)

    const turn = await InterviewService.SubmitAnswer('s1', 'sess', 'A strong answer')

    expect(turn.feedback?.sampleAnswer).toBeNull()
    expect(repo.recordAnswer).toHaveBeenCalledWith(expect.objectContaining({ sampleAnswer: null }))
  })

  it('completes the interview on the fifth answer', async () => {
    const answers = [0, 1, 2, 3].map((i) => answerRow(i, `A${i}`)).concat(answerRow(4, null))
    repo.findOwned.mockResolvedValue(session(answers) as never)
    generate.mockResolvedValue(
      '{"tip":"Good close.","score":8,"summary":"Strong overall.","overallScore":74,"strengths":["Clear"],"improvements":["More detail"]}',
    )
    repo.recordAnswer.mockResolvedValue(true)

    const turn = await InterviewService.SubmitAnswer('s1', 'sess', 'My final answer')

    expect(turn.nextQuestion).toBeNull()
    expect(turn.result).toEqual({
      overallScore: 74,
      summary: 'Strong overall.',
      strengths: ['Clear'],
      improvements: ['More detail'],
    })
    expect(repo.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        idx: 4,
        result: expect.objectContaining({ overallScore: 74 }) as unknown,
      }),
    )
  })

  it('does not advance when the model reply is unusable, so the same question can be retried', async () => {
    repo.findOwned.mockResolvedValue(session([answerRow(0, null)]) as never)
    generate.mockResolvedValue('not json')

    await expect(InterviewService.SubmitAnswer('s1', 'sess', 'x')).rejects.toMatchObject({ statusCode: 500 })
    expect(repo.recordAnswer).not.toHaveBeenCalled()
  })

  it("treats another student's or a missing interview as not found", async () => {
    repo.findOwned.mockResolvedValue(null)

    await expect(InterviewService.SubmitAnswer('s1', 'other', 'x')).rejects.toMatchObject({ statusCode: 404 })
    expect(repo.findOwned).toHaveBeenCalledWith('other', 's1')
  })

  it('rejects answers to a finished interview', async () => {
    repo.findOwned.mockResolvedValue(session([answerRow(0, 'A')], { status: 'COMPLETED' }) as never)

    await expect(InterviewService.SubmitAnswer('s1', 'sess', 'x')).rejects.toMatchObject({ statusCode: 409 })
    expect(generate).not.toHaveBeenCalled()
  })

  it('reports a conflict on a double submit', async () => {
    repo.findOwned.mockResolvedValue(session([answerRow(0, null)]) as never)
    generate.mockResolvedValue('{"tip":"ok","score":5,"nextQuestion":"Next?"}')
    repo.recordAnswer.mockResolvedValue(false)

    await expect(InterviewService.SubmitAnswer('s1', 'sess', 'x')).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe('InterviewService.Abandon', () => {
  it('stops an in-progress interview', async () => {
    repo.abandon.mockResolvedValue({ count: 1 })
    await expect(InterviewService.Abandon('s1', 'sess')).resolves.toEqual({ sessionId: 'sess', status: 'ABANDONED' })
  })

  it('404s when there is nothing to stop', async () => {
    repo.abandon.mockResolvedValue({ count: 0 })
    await expect(InterviewService.Abandon('s1', 'sess')).rejects.toMatchObject({ statusCode: 404 })
  })
})
