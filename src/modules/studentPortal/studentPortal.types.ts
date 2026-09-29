import type { ApplicationStatus, IntakeMonth, JourneyCheckKey } from '../../generated/prisma/index.js'

// Mirrors smetase-web/src/lib/api/types.ts — the contract the student web app reads.

export type JourneyStageKey = 'PROFILE' | 'EXPLORE' | 'CHOOSE' | 'APPLY' | 'OFFER' | 'ENGLISH' | 'FUNDS' | 'VISA'
export type JourneyStageStatus = 'DONE' | 'CURRENT' | 'UPCOMING'
// Who does the work at this stage; ADVISOR stages are the human handoff points.
export type StageOwner = 'YOU' | 'SMETASE' | 'ADVISOR'

// checkKey: set for items ticked by hand (student_journey_checks), null for items derived from data.
// canTick: whether the student may tick it themselves (staff can tick any checkKey item).
export type ChecklistItem = {
  id: string
  label: string
  done: boolean
  checkKey: JourneyCheckKey | null
  canTick: boolean
}

export type JourneyStage = {
  key: JourneyStageKey
  title: string
  description: string
  status: JourneyStageStatus
  owner: StageOwner
  checklist: ChecklistItem[]
}

export type NextStep = {
  title: string
  description: string
  action: { label: string; target: 'CHAT' | 'PLAN' | 'STUDY_PLAN' } | null
}

export type Journey = {
  currentStage: JourneyStageKey
  stages: JourneyStage[]
  nextStep: NextStep
}

export type JourneyInput = {
  profile: {
    studyLevel: string | null
    destinations: string[]
    intakeSet: boolean
    budgetRange: string | null
    academicBackground: string | null
    englishTest: string | null
  }
  shortlistCount: number
  hasChoice: boolean
  studyPlanShared: boolean
  // The most advanced open application (REJECTED/WITHDRAWN ignored), if any.
  applicationStatus: ApplicationStatus | null
  advisorName: string | null
  // Steps ticked by hand (student_journey_checks).
  checks: ReadonlySet<JourneyCheckKey>
}

export type StudentMe = {
  publicId: string
  firstName: string
  fullName: string
  email: string | null
  studyLevel: string | null
  destinations: string[]
  intake: { month: IntakeMonth; year: number } | null
  budgetRange: string | null
  academicBackground: string | null
  englishTest: string | null
  // handling = the conversation has been handed to this advisor.
  advisor: { name: string; handling: boolean } | null
  conversationMode: 'AI_BOT' | 'HUMAN_ADVISOR'
  // A Telegram account is linked, so the bot can reach them (and advisor replies can nudge there).
  telegramLinked: boolean
}

export type Money = { amount: number; currency: string }

export type ProgrammeMatch = {
  programmeId: string
  programmeName: string
  level: string
  schoolName: string
  city: string
  country: string
  duration: string
  intakes: string[]
  tuition: Money
  scores: {
    overall: number
    programmeFit: number
    budgetFit: number
    intakeFit: number
    visaFit: number
  }
  reasons: string[]
  missingRequirements: string[]
  shortlisted: boolean
  chosen: boolean
}

// A one-page summary a student can share with a parent, sponsor, guardian or anyone helping them.
export type StudyPlan = {
  studentName: string
  programme: ProgrammeMatch
  costBreakdown: { label: string; amount: Money }[]
  total: Money
  requirementsMet: string[]
  requirementsMissing: string[]
  nextSteps: { title: string; when: string }[]
  advisor: { name: string; email: string | null } | null
  generatedAt: string
}

// What a parent or sponsor sees through a public link: first name only, no ids or contact details.
export type PublicStudyPlan = Omit<StudyPlan, 'studentName'> & { studentFirstName: string }

export type StudyPlanShareLink = { url: string; expiresAt: string }

export type PortalChatMessage = {
  id: string
  senderType: 'STUDENT' | 'AGENT' | 'ADVISOR' | 'SYSTEM'
  // "Smetase AI" for the AI, the advisor's name for advisor messages, null for the student.
  senderName: string | null
  content: string
  channel: 'TELEGRAM' | 'WEB'
  createdAt: Date
}

export type PortalChat = {
  messages: PortalChatMessage[]
  // true once an advisor has taken over: the AI stops replying until it's handed back.
  advisorHandling: boolean
}

export type UpdateProfileDTO = {
  studyLevel?: string | undefined
  destinations?: string[] | undefined
  intake?: { month: IntakeMonth; year: number } | undefined
  budgetRange?: string | undefined
  academicBackground?: string | undefined
  englishTest?: string | undefined
}
