import { createError } from '../../common/errors/AppError'
import { AUTH_ERROR_CODES } from '../../common/errors/errorCodes'
import {
  ConversationMode,
  IntakeMonth,
  MessageChannel,
  MessageSenderType,
  type ConversationMessages,
  type StudyLevel,
} from '../../generated/prisma/index.js'
import { CentrifugoClient } from '../../integrations/centrifugo/services/centrifugo.client.js'
import { ContactsRepo } from '../contacts/contacts.repository.js'
import { ConversationsRepo } from '../conversations/conversations.repository.js'
import { StudentMessageService } from '../conversations/studentMessage.service.js'
import { normalizeCountry } from '../matching/matching.normalizers.js'
import { MatchingRepo } from '../matching/matching.repository.js'
import { RecommendationsRepo } from '../recommendations/recommendations.repository.js'
import {
  scoreProgram,
  type CandidateProgram,
  type ScoredProgram,
} from '../recommendations/recommendations.scoring.js'
import { StudentsRepo } from '../students/students.repository.js'
import { buildAdvisorLookup } from '../team/advisor-lookup.js'
import { VisaRatesRepo } from '../visaRates/visaRates.repository.js'
import { deriveJourney, mostAdvancedOpenApplication } from './studentJourney'
import StudentPortalRepo from './studentPortal.repository'
import type {
  Journey,
  PortalChat,
  PortalChatMessage,
  ProgrammeMatch,
  StudentMe,
  StudyPlan,
  UpdateProfileDTO,
} from './studentPortal.types'

// Everything here is scoped to the signed-in student's id from the token. The staff
// services aren't reused because they're guarded by staff ownership checks.

const POOL_CAP = 300 // same candidate pool as recommendation runs
const MATCH_LIMIT = 10
const MESSAGE_LIMIT = 50

const LEVEL_LABEL: Record<StudyLevel, string> = {
  UNDERGRADUATE: 'Undergraduate',
  POSTGRADUATE: 'Postgraduate',
  DOCTORATE: 'Doctorate',
  FOUNDATION: 'Foundation',
}

const MONTHS = Object.values(IntakeMonth)
const monthLabel = (month: IntakeMonth) => month.charAt(0) + month.slice(1).toLowerCase()

const notFound = () => createError('Programme not found', 404, {}, 'NOT_FOUND')

const loadStudent = async (studentId: string) => {
  const student = await StudentPortalRepo.findStudent(studentId)
  if (!student) {
    throw createError(
      'Your session has ended, please sign in again',
      401,
      {},
      AUTH_ERROR_CODES.AUTH_SESSION_NOT_FOUND,
    )
  }
  return student
}

type PortalStudent = Awaited<ReturnType<typeof loadStudent>>

const fullNameOf = (student: PortalStudent) =>
  [student.contact.first_name, student.contact.last_name].filter(Boolean).join(' ')

const advisorNameOf = async (student: PortalStudent) => {
  if (!student.assigned_advisor_id) return null
  const advisors = await buildAdvisorLookup([student.assigned_advisor_id])
  return advisors.get(student.assigned_advisor_id)?.fullName ?? null
}

// Same inputs RecommendationsService.GenerateRun gathers, without saving a run.
const scoringContext = async (student: PortalStudent) => {
  const countries = student.target_destinations.length
    ? student.target_destinations.map(normalizeCountry)
    : undefined
  const [{ weights }, rates] = await Promise.all([
    RecommendationsRepo.getCurrentWeights(),
    VisaRatesRepo.findLatestActiveForCountries(countries ?? []),
  ])
  return {
    countries,
    weights,
    visaRateByCountry: new Map(rates.map((rate) => [rate.country.toLowerCase(), rate])),
  }
}

const toProgrammeMatch = (
  scored: ScoredProgram,
  shortlisted: Set<string>,
  chosenId: string | null,
): ProgrammeMatch => {
  const program = scored.program
  return {
    programmeId: program.public_id,
    programmeName: program.name,
    level: LEVEL_LABEL[program.study_level],
    schoolName: program.school.name,
    city: program.school.city,
    country: program.school.country,
    duration: program.duration,
    intakes: [...program.intakes]
      .sort((a, b) => a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
      .map((intake) => `${monthLabel(intake.month)} ${intake.year}`),
    tuition: { amount: Number(program.tuition_amount), currency: program.tuition_currency },
    scores: {
      overall: scored.overallScore,
      programmeFit: scored.fits.program.score,
      budgetFit: scored.fits.budget.score,
      intakeFit: scored.fits.intake.score,
      visaFit: scored.fits.visa.score,
    },
    reasons: scored.reasons,
    missingRequirements: scored.missingRequirements,
    shortlisted: shortlisted.has(program.id),
    chosen: program.id === chosenId,
  }
}

const toChatMessage =
  (advisorName: string | null) =>
  (message: ConversationMessages): PortalChatMessage => ({
    id: message.id,
    senderType: message.sender_type,
    senderName:
      message.sender_type === MessageSenderType.AGENT
        ? 'Smetase AI'
        : message.sender_type === MessageSenderType.ADVISOR
          ? (advisorName ?? 'Your advisor')
          : null,
    content: message.content,
    channel: message.channel,
    createdAt: message.created_at,
  })

// Scores a single programme for the student (shortlist responses and the study plan).
const scoreOne = async (studentId: string, program: CandidateProgram) => {
  const student = await loadStudent(studentId)
  const [ctx, shortlisted] = await Promise.all([
    scoringContext(student),
    RecommendationsRepo.findShortlistedProgramIds(studentId),
  ])
  return toProgrammeMatch(
    scoreProgram(student, program, ctx.weights, ctx.visaRateByCountry),
    shortlisted,
    student.chosen_program_id,
  )
}

const StudentPortalService = {
  GetMe: async (studentId: string): Promise<StudentMe> => {
    const student = await loadStudent(studentId)
    const advisorName = await advisorNameOf(student)
    const mode = student.conversations[0]?.mode ?? 'AI_BOT'
    return {
      publicId: student.public_id,
      firstName: student.contact.first_name,
      fullName: fullNameOf(student),
      // The Google identity's email; a Telegram identity has none.
      email: student.identities.find((i) => i.provider === 'GOOGLE')?.email ?? student.contact.email,
      studyLevel: student.study_level,
      destinations: student.target_destinations,
      intake:
        student.target_intake_month && student.target_intake_year
          ? { month: student.target_intake_month, year: student.target_intake_year }
          : null,
      budgetRange: student.budget_range,
      academicBackground: student.academic_background,
      englishTest: student.english_test_score,
      advisor: advisorName ? { name: advisorName, handling: mode === 'HUMAN_ADVISOR' } : null,
      conversationMode: mode,
      telegramLinked: student.identities.some((i) => i.provider === 'TELEGRAM'),
    }
  },

  UpdateProfile: async (studentId: string, dto: UpdateProfileDTO): Promise<StudentMe> => {
    await StudentsRepo.updateStudentPreferences(studentId, {
      ...(dto.studyLevel !== undefined && { studyLevel: dto.studyLevel }),
      ...(dto.destinations !== undefined && { targetDestinations: dto.destinations }),
      ...(dto.intake !== undefined && {
        targetIntakeMonth: dto.intake.month,
        targetIntakeYear: dto.intake.year,
      }),
      ...(dto.budgetRange !== undefined && { budgetRange: dto.budgetRange }),
      ...(dto.academicBackground !== undefined && { academicBackground: dto.academicBackground }),
      ...(dto.englishTest !== undefined && { englishTestScore: dto.englishTest }),
    })
    return StudentPortalService.GetMe(studentId)
  },

  GetJourney: async (studentId: string): Promise<Journey> => {
    const student = await loadStudent(studentId)
    const [shortlistCount, statuses, advisorName] = await Promise.all([
      StudentPortalRepo.countShortlist(studentId),
      StudentPortalRepo.listApplicationStatuses(studentId),
      advisorNameOf(student),
    ])
    return deriveJourney({
      profile: {
        studyLevel: student.study_level,
        destinations: student.target_destinations,
        intakeSet: Boolean(student.target_intake_month && student.target_intake_year),
        budgetRange: student.budget_range,
        academicBackground: student.academic_background,
        englishTest: student.english_test_score,
      },
      shortlistCount,
      hasChoice: student.chosen_program_id !== null,
      studyPlanShared: student.study_plan_shared_at !== null,
      applicationStatus: mostAdvancedOpenApplication(statuses),
      advisorName,
    })
  },

  // Top 10 by score, plus anything shortlisted or chosen, so a saved programme never vanishes.
  GetMatches: async (studentId: string): Promise<ProgrammeMatch[]> => {
    const student = await loadStudent(studentId)
    const ctx = await scoringContext(student)
    const [candidates, shortlisted] = await Promise.all([
      MatchingRepo.findMatchingPrograms({ countries: ctx.countries, poolCap: POOL_CAP }),
      RecommendationsRepo.findShortlistedProgramIds(studentId),
    ])
    return candidates
      .map((program) => scoreProgram(student, program, ctx.weights, ctx.visaRateByCountry))
      .sort((a, b) => b.overallScore - a.overallScore)
      .filter(
        (scored, index) =>
          index < MATCH_LIMIT ||
          shortlisted.has(scored.program.id) ||
          scored.program.id === student.chosen_program_id,
      )
      .map((scored) => toProgrammeMatch(scored, shortlisted, student.chosen_program_id))
  },

  AddToShortlist: async (studentId: string, programmePublicId: string): Promise<ProgrammeMatch> => {
    const program = await StudentPortalRepo.findProgramForScoring(programmePublicId, { activeOnly: true })
    if (!program) throw notFound()
    await RecommendationsRepo.upsertShortlist(studentId, program.id)
    return scoreOne(studentId, program)
  },

  RemoveFromShortlist: async (studentId: string, programmePublicId: string): Promise<ProgrammeMatch> => {
    const program = await StudentPortalRepo.findProgramForScoring(programmePublicId, { activeOnly: false })
    if (!program) throw notFound()
    await StudentPortalRepo.removeFromShortlist(studentId, program.id)
    return scoreOne(studentId, program)
  },

  Choose: async (studentId: string, programmePublicId: string): Promise<Journey> => {
    const program = await StudentPortalRepo.findProgramForScoring(programmePublicId, { activeOnly: true })
    if (!program) throw notFound()
    await StudentPortalRepo.choose(studentId, program.id)
    return StudentPortalService.GetJourney(studentId)
  },

  GetStudyPlan: async (studentId: string): Promise<StudyPlan | null> => {
    const student = await loadStudent(studentId)
    if (!student.chosen_program_id) return null
    const program = await StudentPortalRepo.findProgramById(student.chosen_program_id)
    if (!program) return null

    const [match, advisorName] = await Promise.all([scoreOne(studentId, program), advisorNameOf(student)])
    return {
      studentName: fullNameOf(student),
      programme: match,
      // Only tuition: living and visa costs aren't in our data, and we don't invent them.
      costBreakdown: [{ label: 'Tuition (per year)', amount: match.tuition }],
      total: match.tuition,
      requirementsMet: match.reasons,
      requirementsMissing: match.missingRequirements,
      nextSteps: [
        { title: 'Apply with your Smetase advisor', when: 'Next' },
        { title: 'Accept the offer and pay the tuition deposit', when: 'After your offer' },
        { title: 'Take your English test (IELTS, or WAEC if accepted)', when: 'Before your offer deadline' },
        { title: 'Proof of funds and visa', when: 'About 3 months before you start' },
      ],
      advisor: advisorName ? { name: advisorName, email: null } : null,
      generatedAt: new Date().toISOString(),
    }
  },

  MarkStudyPlanShared: async (studentId: string) => {
    await StudentPortalRepo.markStudyPlanShared(studentId)
  },

  // One continuous thread across all the student's conversations (and both channels).
  GetMessages: async (studentId: string): Promise<PortalChat> => {
    const student = await loadStudent(studentId)
    const [messages, advisorName, current] = await Promise.all([
      ConversationsRepo.findStudentMessages(studentId, MESSAGE_LIMIT),
      advisorNameOf(student),
      ConversationsRepo.findCurrentConversation(studentId),
    ])
    return {
      messages: messages.map(toChatMessage(advisorName)),
      advisorHandling: current?.mode === ConversationMode.HUMAN_ADVISOR,
    }
  },

  // Returns the student's saved message, plus the AI reply unless an advisor has taken over.
  SendMessage: async (studentId: string, content: string): Promise<{ messages: PortalChatMessage[] }> => {
    const student = await loadStudent(studentId)
    // After a resolve there's no open thread; start one, as Telegram does.
    const conversation =
      (await ConversationsRepo.findCurrentConversation(studentId)) ??
      (await ContactsRepo.createStudentConversation(studentId))

    const { message, reply } = await StudentMessageService.Receive({
      conversationId: conversation.id,
      studentId,
      text: content,
      channel: MessageChannel.WEB,
    })

    // Same live event the Telegram worker sends, so the staff dashboard updates.
    await CentrifugoClient.publish('admin:dashboard', {
      event: 'message.created',
      data: {
        publicId: student.public_id,
        studentId,
        conversationId: conversation.id,
        firstName: student.contact.first_name,
        text: content,
        channel: MessageChannel.WEB,
        isNewStudent: false,
      },
      timestamp: new Date().toISOString(),
    })

    const advisorName = await advisorNameOf(student)
    return { messages: [message, ...(reply ? [reply] : [])].map(toChatMessage(advisorName)) }
  },
}

export default StudentPortalService
