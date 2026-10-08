import type { ApplicationStatus, JourneyCheckKey } from '../../generated/prisma/index.js'
import { hasEnglishEvidence } from '../recommendations/recommendations.scoring.js'
import type { Journey, JourneyInput, JourneyStageKey, NextStep, StageOwner } from './studentPortal.types'

// Pure: derives the student's journey from their data. No database access here.

const STAGE_ORDER: JourneyStageKey[] = ['PROFILE', 'EXPLORE', 'CHOOSE', 'APPLY', 'OFFER', 'ENGLISH', 'FUNDS', 'VISA']

// checkKey marks an item ticked by hand (student_journey_checks); the rest come from data.
type ChecklistDef = { label: string; checkKey?: JourneyCheckKey }

const STAGE_DEFS: Record<
  JourneyStageKey,
  { title: string; description: string; owner: StageOwner; checklist: ChecklistDef[] }
> = {
  PROFILE: {
    title: 'Your profile',
    description: 'Tell us what you want to study, where and when.',
    owner: 'SMETASE',
    checklist: [
      { label: 'Study level' },
      { label: 'Destination' },
      { label: 'Start date' },
      { label: 'Budget' },
      { label: 'Academic background' },
      { label: 'English test' },
    ],
  },
  EXPLORE: {
    title: 'Explore',
    description: 'See programmes that fit you, and why.',
    owner: 'SMETASE',
    checklist: [{ label: 'Review your matches' }, { label: 'Shortlist at least one programme' }],
  },
  CHOOSE: {
    title: 'Shortlist & choose',
    description: 'Pick one programme and share your plan with whoever is helping you.',
    owner: 'YOU',
    checklist: [{ label: 'Choose a programme' }, { label: 'Share your study plan' }],
  },
  APPLY: {
    title: 'Apply',
    description: 'Your advisor helps you prepare and submit.',
    owner: 'ADVISOR',
    checklist: [{ label: 'Documents ready' }, { label: 'Application submitted' }],
  },
  OFFER: {
    title: 'Offer & tuition',
    description: 'Accept your offer and pay the deposit.',
    owner: 'YOU',
    checklist: [{ label: 'Offer received' }, { label: 'Tuition deposit paid', checkKey: 'DEPOSIT_PAID' }],
  },
  ENGLISH: {
    title: 'English test',
    description: 'IELTS booked and score in (or WAEC accepted).',
    owner: 'YOU',
    checklist: [
      { label: 'Test booked', checkKey: 'ENGLISH_TEST_BOOKED' },
      { label: 'Score received', checkKey: 'ENGLISH_SCORE_RECEIVED' },
    ],
  },
  FUNDS: {
    title: 'Proof of funds',
    description: 'Show the funds your visa needs.',
    owner: 'ADVISOR',
    checklist: [
      { label: 'Funds plan agreed', checkKey: 'FUNDS_PLAN_AGREED' },
      { label: 'Documents ready', checkKey: 'FUNDS_DOCUMENTS_READY' },
    ],
  },
  VISA: {
    title: 'Visa',
    description: 'Apply for your student visa.',
    owner: 'ADVISOR',
    checklist: [{ label: 'Application submitted' }, { label: 'Biometrics done' }, { label: 'Decision received' }],
  },
}

// Checks a student may tick themselves; the rest (proof of funds) are the advisor's call.
export const STUDENT_TICKABLE_CHECKS: ReadonlySet<JourneyCheckKey> = new Set<JourneyCheckKey>([
  'DEPOSIT_PAID',
  'ENGLISH_TEST_BOOKED',
  'ENGLISH_SCORE_RECEIVED',
])

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

// Done because the data says so, whether or not anyone ticked it. Such items can't be unticked.
const doneFromData = (key: JourneyCheckKey, input: JourneyInput): boolean => {
  const hasScore = hasEnglishEvidence(input.profile.englishTest)
  switch (key) {
    case 'DEPOSIT_PAID':
      return reached(input.applicationStatus, 'VISA_PROCESSING')
    case 'ENGLISH_TEST_BOOKED':
    case 'ENGLISH_SCORE_RECEIVED':
      return hasScore
    case 'FUNDS_PLAN_AGREED':
      return input.checks.has('FUNDS_DOCUMENTS_READY')
    case 'FUNDS_DOCUMENTS_READY':
      return false
  }
}

const isDone = (key: JourneyCheckKey, input: JourneyInput) => input.checks.has(key) || doneFromData(key, input)

// Applications are checked first: a lead an advisor is already applying for shouldn't
// be stuck on "finish your profile" because its budget was never recorded.
// After an offer: deposit, then English, then proof of funds, then the visa.
export const currentStageFor = (input: JourneyInput): JourneyStageKey => {
  const app = input.applicationStatus
  if (reached(app, 'VISA_PROCESSING')) return 'VISA'
  if (reached(app, 'OFFER_RECEIVED')) {
    if (!isDone('DEPOSIT_PAID', input)) return 'OFFER'
    if (!isDone('ENGLISH_SCORE_RECEIVED', input)) return 'ENGLISH'
    if (!isDone('FUNDS_DOCUMENTS_READY', input)) return 'FUNDS'
    return 'VISA'
  }
  if (reached(app, 'DRAFT')) return 'APPLY'
  if (!profileChecks(input.profile).every(Boolean)) return 'PROFILE'
  if (input.shortlistCount === 0 && !input.hasChoice) return 'EXPLORE'
  return 'CHOOSE'
}

// Values for the items without a checkKey (the ticked ones are read from input.checks).
const derivedValues = (key: JourneyStageKey, input: JourneyInput): boolean[] => {
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
      return [reached(app, 'OFFER_RECEIVED'), false]
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
        description: "Accept it and plan the tuition deposit with whoever is supporting you. Tick it off once it's paid.",
        action: { label: 'Open study plan', target: 'STUDY_PLAN' },
      }
    case 'ENGLISH':
      return isDone('ENGLISH_TEST_BOOKED', input)
        ? {
            title: 'Waiting for your English score',
            description: 'Tick it off here once your result is in, and tell us your score in the chat.',
            action: { label: 'Go to chat', target: 'CHAT' },
          }
        : {
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

// viewer decides canTick: students tick their own steps; staff can tick any ticked-by-hand step.
export const deriveJourney = (input: JourneyInput, viewer: 'STUDENT' | 'STAFF' = 'STUDENT'): Journey => {
  const currentStage = currentStageFor(input)
  const current = STAGE_ORDER.indexOf(currentStage)

  return {
    currentStage,
    stages: STAGE_ORDER.map((key, index) => {
      const status = index < current ? 'DONE' : index === current ? 'CURRENT' : 'UPCOMING'
      const values = derivedValues(key, input)
      const def = STAGE_DEFS[key]
      return {
        key,
        title: def.title,
        description: def.description,
        owner: def.owner,
        status,
        checklist: def.checklist.map((item, i) => {
          const checkKey = item.checkKey ?? null
          const ticked = checkKey ? input.checks.has(checkKey) : false
          const fromData = checkKey ? doneFromData(checkKey, input) : (values[i] ?? false)
          // Everything in a stage the student has moved past counts as done.
          const done = status === 'DONE' || ticked || fromData
          // Locked when the data (or a later stage) already makes it done: unticking would change nothing.
          const locked = fromData || (status === 'DONE' && !ticked)
          const viewerMay = viewer === 'STAFF' || (checkKey !== null && STUDENT_TICKABLE_CHECKS.has(checkKey))
          return {
            id: `${key}-${i}`,
            label: item.label,
            done,
            checkKey,
            canTick: checkKey !== null && viewerMay && !locked,
          }
        }),
      }
    }),
    nextStep: nextStepFor(currentStage, input),
  }
}
