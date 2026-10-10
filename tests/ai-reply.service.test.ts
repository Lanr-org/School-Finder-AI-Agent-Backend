import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIReplyService } from '../src/modules/ai/ai-reply.service'
import { StudentsRepo } from '../src/modules/students/students.repository'
import { MatchingService } from '../src/modules/matching/matching.service'
import { IndustryContextService } from '../src/modules/ai/industry-context.service'
import { ConversationsRepo } from '../src/modules/conversations/conversations.repository'
import { llmClient } from '../src/integrations/llm/index.js'
import JourneyService from '../src/modules/studentPortal/studentJourney.service'
import { deriveJourney } from '../src/modules/studentPortal/studentJourney'

vi.mock('../src/modules/students/students.repository', () => ({
  StudentsRepo: {
    findStudentById: vi.fn(),
  },
}))

vi.mock('../src/modules/matching/matching.service', () => ({
  MatchingService: {
    FindMatchesForStudent: vi.fn(),
  },
}))

vi.mock('../src/modules/ai/industry-context.service', () => ({
  IndustryContextService: {
    GetGroundingContext: vi.fn(),
  },
}))

vi.mock('../src/modules/conversations/conversations.repository', () => ({
  ConversationsRepo: {
    createMessage: vi.fn(),
    findRecentMessages: vi.fn(),
  },
}))

vi.mock('../src/integrations/llm/index.js', () => ({
  llmClient: {
    generateReply: vi.fn(),
  },
}))

vi.mock('../src/modules/studentPortal/studentJourney.service', () => ({
  default: { ForStudent: vi.fn() },
}))

const journeyMock = vi.mocked(JourneyService)

const studentsRepoMock = vi.mocked(StudentsRepo)
const matchingServiceMock = vi.mocked(MatchingService)
const industryContextServiceMock = vi.mocked(IndustryContextService)
const conversationsRepoMock = vi.mocked(ConversationsRepo)
const llmClientMock = vi.mocked(llmClient)

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: 'student-uuid-1',
  public_id: 'STU-8440',
  ...overrides,
})

describe('AIReplyService.GenerateReply', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    conversationsRepoMock.createMessage.mockResolvedValue({} as any)
    conversationsRepoMock.findRecentMessages.mockResolvedValue([])
    matchingServiceMock.FindMatchesForStudent.mockResolvedValue([])
    industryContextServiceMock.GetGroundingContext.mockResolvedValue({
      bulletins: [],
      visaRates: [],
    })
    llmClientMock.generateReply.mockResolvedValue('AI reply text')
    journeyMock.ForStudent.mockResolvedValue(null)
  })

  it("adds the student's journey: current stage, next step, what's left and what's done", async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)
    journeyMock.ForStudent.mockResolvedValue(
      deriveJourney({
        profile: {
          studyLevel: 'MASTERS',
          destinations: ['UK'],
          intakeSet: true,
          budgetRange: '£15k',
          academicBackground: 'BSc',
          englishTest: 'Not taken yet',
        },
        shortlistCount: 1,
        hasChoice: true,
        studyPlanShared: true,
        applicationStatus: 'OFFER_RECEIVED',
        advisorName: 'Amina Yusuf',
        checks: new Set(['DEPOSIT_PAID', 'ENGLISH_TEST_BOOKED']),
      }),
    )

    await AIReplyService.GenerateReply('conv-1', 'student-uuid-1', 'WEB')

    expect(journeyMock.ForStudent).toHaveBeenCalledWith('student-uuid-1')
    const [, systemPromptArg] = llmClientMock.generateReply.mock.calls[0]!
    expect(systemPromptArg).toContain("Student's journey:")
    expect(systemPromptArg).toContain('Current stage: English test (owner: the student)')
    expect(systemPromptArg).toContain('Next step: Waiting for your English score.')
    expect(systemPromptArg).toContain('Still to do in this stage: Score received')
    expect(systemPromptArg).toContain('Done so far: Your profile, Explore, Shortlist & choose, Apply, Offer & tuition')
  })

  it('still replies when the journey fails to load, and says it is unknown', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)
    journeyMock.ForStudent.mockRejectedValue(new Error('db down'))

    await AIReplyService.GenerateReply('conv-1', 'student-uuid-1', 'WEB')

    const [, systemPromptArg] = llmClientMock.generateReply.mock.calls[0]!
    expect(systemPromptArg).toContain('Journey not available')
    expect(conversationsRepoMock.createMessage).toHaveBeenCalled()
  })

  it('does not save the student message (StudentMessageService already has)', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)

    await AIReplyService.GenerateReply('conv-1', 'student-uuid-1', 'WEB')

    expect(conversationsRepoMock.createMessage).toHaveBeenCalledTimes(1)
    expect(conversationsRepoMock.createMessage).not.toHaveBeenCalledWith(
      expect.anything(),
      'STUDENT',
      expect.anything(),
      expect.anything(),
    )
  })

  it('throws NOT_FOUND when the student does not exist, without calling the LLM', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(null as any)

    await expect(
      AIReplyService.GenerateReply('conv-1', 'missing-student', 'WEB'),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    expect(llmClientMock.generateReply).not.toHaveBeenCalled()
  })

  it('maps STUDENT messages to the user role and everything else to assistant', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)
    conversationsRepoMock.findRecentMessages.mockResolvedValue([
      { sender_type: 'STUDENT', content: 'Hi', created_at: new Date() },
      { sender_type: 'AGENT', content: 'Hello!', created_at: new Date() },
      {
        sender_type: 'ADVISOR',
        content: 'I can help.',
        created_at: new Date(),
      },
    ] as any)

    await AIReplyService.GenerateReply(
      'conv-1',
      'student-uuid-1',
      'WEB',
    )

    const [messagesArg] = llmClientMock.generateReply.mock.calls[0]!
    expect(messagesArg).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'assistant', content: 'I can help.' },
    ])
  })

  it('includes real intake months/years/deadlines from the shortlist in the system prompt', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)
    matchingServiceMock.FindMatchesForStudent.mockResolvedValue([
      {
        publicId: 'PRG-2001',
        name: 'BSc Psychology',
        studyLevel: 'UNDERGRADUATE',
        qualification: 'BSc',
        category: 'Psychology',
        tuitionAmount: 15973,
        tuitionCurrency: 'GBP',
        feesAcademicYear: null,
        verifiedAt: null,
        intakes: [
          {
            month: 'SEPTEMBER',
            year: 2026,
            applicationDeadline: new Date('2026-06-01'),
          },
        ],
        school: {
          publicId: 'SCH-4667',
          name: 'University of East London',
          country: 'United Kingdom',
          city: 'London',
        },
      },
    ])

    await AIReplyService.GenerateReply(
      'conv-1',
      'student-uuid-1',
      'WEB',
    )

    const [, systemPromptArg] = llmClientMock.generateReply.mock.calls[0]!
    expect(systemPromptArg).toContain('BSc Psychology')
    expect(systemPromptArg).toContain('SEPTEMBER 2026')
    expect(systemPromptArg).toContain('apply by')
  })

  it('says no shortlist is available when matching returns nothing', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)
    matchingServiceMock.FindMatchesForStudent.mockResolvedValue([])

    await AIReplyService.GenerateReply(
      'conv-1',
      'student-uuid-1',
      'WEB',
    )

    const [, systemPromptArg] = llmClientMock.generateReply.mock.calls[0]!
    expect(systemPromptArg).toContain('No shortlist available yet')
  })

  it('includes verified visa success rates and bulletins in the system prompt when available', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(
      makeStudent({ target_destinations: ['UK'] }) as any,
    )
    industryContextServiceMock.GetGroundingContext.mockResolvedValue({
      bulletins: [
        {
          id: 'bul-1',
          public_id: 'BUL-1001',
          title: 'Graduate Route processing times shortened',
          body: 'Processing times have improved this quarter.',
          source_partner: 'Edvoy',
          countries: ['United Kingdom'],
          published_at: new Date('2026-09-01'),
          expires_at: null,
          is_active: true,
          created_by: 'admin-uuid',
          created_at: new Date('2026-09-01'),
          updated_at: new Date('2026-09-01'),
        } as any,
      ],
      visaRates: [
        {
          id: 'rate-1',
          public_id: 'VSR-1001',
          country: 'United Kingdom',
          source_partner: 'Edvoy',
          period_label: 'Q3 2026',
          success_rate: 82,
          sample_size: 340,
          published_at: new Date('2026-09-01'),
          is_active: true,
          created_by: 'admin-uuid',
          created_at: new Date('2026-09-01'),
          updated_at: new Date('2026-09-01'),
        } as any,
      ],
    })

    await AIReplyService.GenerateReply(
      'conv-1',
      'student-uuid-1',
      'TELEGRAM',
    )

    expect(industryContextServiceMock.GetGroundingContext).toHaveBeenCalledWith(
      ['UK'],
    )
    const [, systemPromptArg] = llmClientMock.generateReply.mock.calls[0]!
    expect(systemPromptArg).toContain('United Kingdom visa success rate: 82%')
    expect(systemPromptArg).toContain('via Edvoy')
    expect(systemPromptArg).toContain(
      'Graduate Route processing times shortened',
    )
  })

  it('tells the model not to state industry specifics when no grounding context is available', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)
    industryContextServiceMock.GetGroundingContext.mockResolvedValue({
      bulletins: [],
      visaRates: [],
    })

    await AIReplyService.GenerateReply(
      'conv-1',
      'student-uuid-1',
      'WEB',
    )

    const [, systemPromptArg] = llmClientMock.generateReply.mock.calls[0]!
    expect(systemPromptArg).toContain(
      'No verified industry updates available right now',
    )
  })

  it('saves the AI reply as an AGENT message on the given channel and returns it', async () => {
    studentsRepoMock.findStudentById.mockResolvedValue(makeStudent() as any)
    llmClientMock.generateReply.mockResolvedValue(
      'Here are some great options for you.',
    )
    const saved = { id: 'msg-2', sender_type: 'AGENT', channel: 'TELEGRAM' }
    conversationsRepoMock.createMessage.mockResolvedValue(saved as any)

    const result = await AIReplyService.GenerateReply(
      'conv-1',
      'student-uuid-1',
      'TELEGRAM',
    )

    expect(result).toBe(saved)
    expect(conversationsRepoMock.createMessage).toHaveBeenCalledWith(
      'conv-1',
      'AGENT',
      'Here are some great options for you.',
      'TELEGRAM',
    )
  })
})
