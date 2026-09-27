import type { ApplicationStatus } from '../../generated/prisma/index.js'
import type { Journey, JourneyInput, JourneyStageKey, NextStep, StageOwner } from './studentPortal.types'

// Pure: derives the student's journey from their data. No database access here.

const STAGE_ORDER: JourneyStageKey[] = ['PROFILE', 'EXPLORE', 'CHOOSE', 'APPLY', 'OFFER', 'ENGLISH', 'FUNDS', 'VISA']

const STAGE_DEFS: Record<
  JourneyStageKey,
  { title: string; description: string; owner: StageOwner; checklist: string[] }
> = {
  PROFILE: {
    title: 'Your profile',
    description: 'Tell us what you want to study, where and when.',
    owner: 'SMETASE',
    checklist: ['Study level', 'Destination', 'Start date', 'Budget', 'Academic background', 'English test'],
  },
  EXPLORE: {
    title: 'Explore',
    description: 'See programmes that fit you, and why.',
    owner: 'SMETASE',
    checklist: ['Review your matches', 'Shortlist at least one programme'],
  },
  CHOOSE: {
    title: 'Shortlist & choose',
    description: 'Pick one programme and share your plan with whoever is helping you.',
    owner: 'YOU',
    checklist: ['Choose a programme', 'Share your study plan'],
  },
  APPLY: {
    title: 'Apply',
    description: 'Your advisor helps you prepare and submit.',
    owner: 'ADVISOR',
    checklist: ['Documents ready', 'Application submitted'],
  },
  OFFER: {
    title: 'Offer & tuition',
    description: 'Accept your offer and pay the deposit.',
    owner: 'YOU',
    checklist: ['Offer received', 'Tuition deposit paid'],
  },
  ENGLISH: {
    title: 'English test',
    description: 'IELTS booked and score in (or WAEC accepted).',
    owner: 'YOU',
    checklist: ['Test booked', 'Score received'],
  },
  FUNDS: {
    title: 'Proof of funds',
    description: 'Show the funds your visa needs.',
    owner: 'ADVISOR',
    checklist: ['Funds plan agreed', 'Documents ready'],
  },
  VISA: {
    title: 'Visa',
    description: 'Apply for your student visa.',
    owner: 'ADVISOR',
    checklist: ['Application submitted', 'Biometrics done', 'Decision received'],
  },
}

// REJECTED/WITHDRAWN are left out: a closed application shouldn't hold the journey.
const APPLICATION_PROGRESS: ApplicationStatus[] = [
  'DRAFT',
  'DOCUMENTS_PENDING',
  'SUBMITTED',
  'OFFER_RECEIVED',
  'VISA_PROCESSING',
  'COMPLETED',
]

const progress = (status: ApplicationStatus | null) => (status ? APPLICATION_PROGRESS.indexOf(status) : -1)
const reached = (status: ApplicationStatus | null, target: ApplicationStatus) =>
  progress(status) >= APPLICATION_PROGRESS.indexOf(target)

export const mostAdvancedOpenApplication = (statuses: ApplicationStatus[]): ApplicationStatus | null =>
  statuses.filter((s) => APPLICATION_PROGRESS.includes(s)).sort((a, b) => progress(b) - progress(a))[0] ?? null

const profileChecks = (profile: JourneyInput['profile']) => [
  Boolean(profile.studyLevel),
  profile.destinations.length > 0,
  profile.intakeSet,
  Boolean(profile.budgetRange),
  Boolean(profile.academicBackground),
  // Answered at all counts here ("Not taken yet" included); scoring separately
  // checks whether it's an actual result.
  Boolean(profile.englishTest),
]

// Applications are checked first: a lead an advisor is already applying for shouldn't
// be stuck on "finish your profile" because its budget was never recorded.
// ENGLISH and FUNDS can't be detected from data yet (Stage 6 adds a checklist table),
// so a student goes OFFER → VISA for now.
export const currentStageFor = (input: JourneyInput): JourneyStageKey => {
  const app = input.applicationStatus
  if (reached(app, 'VISA_PROCESSING')) return 'VISA'
  if (reached(app, 'OFFER_RECEIVED')) return 'OFFER'
  if (reached(app, 'DRAFT')) return 'APPLY'
  if (!profileChecks(input.profile).every(Boolean)) return 'PROFILE'
  if (input.shortlistCount === 0 && !input.hasChoice) return 'EXPLORE'
  return 'CHOOSE'
}

const checklistValues = (key: JourneyStageKey, input: JourneyInput): boolean[] => {
  const app = input.applicationStatus
  const shortlisted = input.shortlistCount > 0 || input.hasChoice
  switch (key) {
    case 'PROFILE':
      return profileChecks(input.profile)
    case 'EXPLORE':
      return [shortlisted, shortlisted]
    case 'CHOOSE':
      return [input.hasChoice, input.studyPlanShared]
    case 'APPLY':
      return [reached(app, 'SUBMITTED'), reached(app, 'SUBMITTED')]
    case 'OFFER':
      return [reached(app, 'OFFER_RECEIVED'), reached(app, 'VISA_PROCESSING')]
    case 'ENGLISH':
    case 'FUNDS':
      return [false, false]
    case 'VISA':
      return [reached(app, 'VISA_PROCESSING'), reached(app, 'COMPLETED'), reached(app, 'COMPLETED')]
  }
}

const firstName = (name: string | null) => name?.split(' ')[0] ?? null

const nextStepFor = (stage: JourneyStageKey, input: JourneyInput): NextStep => {
  const advisor = input.advisorName ?? 'Your advisor'
  const shortName = firstName(input.advisorName)
  const messageAdvisor = { label: shortName ? `Message ${shortName}` : 'Open chat', target: 'CHAT' as const }

  switch (stage) {
    case 'PROFILE':
      return {
        title: 'Finish your profile',
        description: 'Answer a few quick questions so we can match you.',
        action: { label: 'Go to chat', target: 'CHAT' },
      }
    case 'EXPLORE':
      return {
        title: 'Review your matches',
        description: 'We found programmes that fit you. Shortlist the ones you like.',
        action: { label: 'See my matches', target: 'PLAN' },
      }
    case 'CHOOSE':
      if (!input.hasChoice) {
        return {
          title: 'Pick your programme',
          description: 'Compare your shortlist and choose the one you want.',
          action: { label: 'See my shortlist', target: 'PLAN' },
        }
      }
      if (!input.studyPlanShared) {
        return {
          title: 'Share your study plan',
          description: 'Send it to a parent, sponsor or anyone helping you: the programme, tuition and next steps.',
          action: { label: 'Open study plan', target: 'STUDY_PLAN' },
        }
      }
      return {
        title: "Tell us you're ready to apply",
        description: 'Say so in the chat and a Smetase advisor will take it from here.',
        action: { label: 'Go to chat', target: 'CHAT' },
      }
    case 'APPLY':
      return {
        title: 'Get your documents ready',
        description: `${advisor} will tell you exactly what's needed.`,
        action: messageAdvisor,
      }
    case 'OFFER':
      return {
        title: 'Accept your offer',
        description: 'Accept it and plan the tuition deposit with whoever is supporting you.',
        action: { label: 'Open study plan', target: 'STUDY_PLAN' },
      }
    case 'ENGLISH':
      return {
        title: 'Book your English test',
        description: 'Book a date that leaves time for your results.',
        action: { label: 'Ask about IELTS', target: 'CHAT' },
      }
    case 'FUNDS':
      return {
        title: 'Sort your proof of funds',
        description: `${advisor} will walk you and your sponsor through it.`,
        action: messageAdvisor,
      }
    case 'VISA':
      return reached(input.applicationStatus, 'COMPLETED')
        ? { title: "You're all set", description: 'Your visa step is complete. Safe travels!', action: null }
        : {
            title: 'Prepare your visa application',
            description: `${advisor} will guide you through each step.`,
            action: messageAdvisor,
          }
  }
}

export const deriveJourney = (input: JourneyInput): Journey => {
  const currentStage = currentStageFor(input)
  const current = STAGE_ORDER.indexOf(currentStage)

  return {
    currentStage,
    stages: STAGE_ORDER.map((key, index) => {
      const status = index < current ? 'DONE' : index === current ? 'CURRENT' : 'UPCOMING'
      const values = checklistValues(key, input)
      const def = STAGE_DEFS[key]
      return {
        key,
        title: def.title,
        description: def.description,
        owner: def.owner,
        status,
        // Everything in a stage the student has moved past counts as done.
        checklist: def.checklist.map((label, i) => ({
          id: `${key}-${i}`,
          label,
          done: status === 'DONE' || (values[i] ?? false),
        })),
      }
    }),
    nextStep: nextStepFor(currentStage, input),
  }
}
