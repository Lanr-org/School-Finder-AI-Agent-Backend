import { describe, expect, it } from 'vitest'
import {
  currentStageFor,
  deriveJourney,
  mostAdvancedOpenApplication,
} from '../src/modules/studentPortal/studentJourney'
import type { JourneyInput } from '../src/modules/studentPortal/studentPortal.types'
import type { JourneyCheckKey } from '../src/generated/prisma/index.js'

const fullProfile = {
  studyLevel: 'MASTERS',
  destinations: ['UK'],
  intakeSet: true,
  budgetRange: '£15k - £25k',
  academicBackground: 'BSc Computer Science, 2:1',
  englishTest: 'IELTS 6.5',
}

const input = (overrides: Partial<JourneyInput> = {}): JourneyInput => ({
  profile: fullProfile,
  shortlistCount: 0,
  hasChoice: false,
  studyPlanShared: false,
  applicationStatus: null,
  advisorName: 'Amina Yusuf',
  checks: new Set(),
  ...overrides,
})

const checks = (...keys: JourneyCheckKey[]) => new Set<JourneyCheckKey>(keys)
// A profile without an actual English result, so the English step isn't auto-ticked.
const noScore = { ...fullProfile, englishTest: 'Not taken yet' }

const stage = (journey: ReturnType<typeof deriveJourney>, key: string) =>
  journey.stages.find((s) => s.key === key)!

describe('currentStageFor', () => {
  it('starts on PROFILE while any profile field is missing', () => {
    expect(
      currentStageFor(
        input({
          profile: {
            studyLevel: null,
            destinations: [],
            intakeSet: false,
            budgetRange: null,
            academicBackground: null,
            englishTest: null,
          },
        }),
      ),
    ).toBe('PROFILE')
    expect(currentStageFor(input({ profile: { ...fullProfile, budgetRange: null } }))).toBe('PROFILE')
    expect(currentStageFor(input({ profile: { ...fullProfile, academicBackground: null } }))).toBe('PROFILE')
    expect(currentStageFor(input({ profile: { ...fullProfile, englishTest: null } }))).toBe('PROFILE')
    // Any English answer completes the profile, even "Not taken yet".
    expect(currentStageFor(input({ profile: { ...fullProfile, englishTest: 'Not taken yet' } }))).toBe('EXPLORE')
  })

  it('moves to EXPLORE with a full profile and nothing shortlisted', () => {
    expect(currentStageFor(input())).toBe('EXPLORE')
  })

  it('moves to CHOOSE once something is shortlisted or chosen', () => {
    expect(currentStageFor(input({ shortlistCount: 1 }))).toBe('CHOOSE')
    expect(currentStageFor(input({ hasChoice: true }))).toBe('CHOOSE')
  })

  it('uses the application first, even with an incomplete profile', () => {
    const incomplete = { ...fullProfile, budgetRange: null }
    expect(currentStageFor(input({ profile: incomplete, applicationStatus: 'DRAFT' }))).toBe('APPLY')
    expect(currentStageFor(input({ applicationStatus: 'SUBMITTED' }))).toBe('APPLY')
    expect(currentStageFor(input({ applicationStatus: 'OFFER_RECEIVED' }))).toBe('OFFER')
    expect(currentStageFor(input({ applicationStatus: 'VISA_PROCESSING' }))).toBe('VISA')
    expect(currentStageFor(input({ applicationStatus: 'COMPLETED' }))).toBe('VISA')
  })

  it('after an offer walks deposit → English → proof of funds → visa', () => {
    const offer = (extra: Partial<JourneyInput>) =>
      currentStageFor(input({ profile: noScore, applicationStatus: 'OFFER_RECEIVED', ...extra }))
    expect(offer({})).toBe('OFFER')
    expect(offer({ checks: checks('DEPOSIT_PAID') })).toBe('ENGLISH')
    // Booked isn't enough: the step waits for the score.
    expect(offer({ checks: checks('DEPOSIT_PAID', 'ENGLISH_TEST_BOOKED') })).toBe('ENGLISH')
    expect(offer({ checks: checks('DEPOSIT_PAID', 'ENGLISH_SCORE_RECEIVED') })).toBe('FUNDS')
    expect(offer({ checks: checks('DEPOSIT_PAID', 'ENGLISH_SCORE_RECEIVED', 'FUNDS_PLAN_AGREED') })).toBe('FUNDS')
    expect(offer({ checks: checks('DEPOSIT_PAID', 'ENGLISH_SCORE_RECEIVED', 'FUNDS_DOCUMENTS_READY') })).toBe('VISA')
  })

  it('skips ENGLISH when the profile already has an actual result', () => {
    expect(
      currentStageFor(input({ applicationStatus: 'OFFER_RECEIVED', checks: checks('DEPOSIT_PAID') })),
    ).toBe('FUNDS')
  })

  it('ignores ticks before an offer: applications still drive the early stages', () => {
    expect(
      currentStageFor(
        input({ applicationStatus: 'SUBMITTED', checks: checks('DEPOSIT_PAID', 'ENGLISH_SCORE_RECEIVED') }),
      ),
    ).toBe('APPLY')
  })
})

describe('mostAdvancedOpenApplication', () => {
  it('ignores rejected and withdrawn applications', () => {
    expect(mostAdvancedOpenApplication(['REJECTED', 'WITHDRAWN'])).toBeNull()
    expect(mostAdvancedOpenApplication([])).toBeNull()
  })

  it('picks the furthest open application', () => {
    expect(mostAdvancedOpenApplication(['DRAFT', 'REJECTED', 'OFFER_RECEIVED', 'SUBMITTED'])).toBe('OFFER_RECEIVED')
  })
})

describe('deriveJourney', () => {
  it('marks earlier stages done with every checklist item ticked', () => {
    const journey = deriveJourney(input({ applicationStatus: 'OFFER_RECEIVED' }))
    expect(journey.currentStage).toBe('OFFER')
    for (const key of ['PROFILE', 'EXPLORE', 'CHOOSE', 'APPLY']) {
      expect(stage(journey, key).status).toBe('DONE')
      expect(stage(journey, key).checklist.every((item) => item.done)).toBe(true)
    }
    expect(stage(journey, 'OFFER').status).toBe('CURRENT')
    expect(stage(journey, 'ENGLISH').status).toBe('UPCOMING')
  })

  it('shows ENGLISH and FUNDS done once the visa step is reached', () => {
    const journey = deriveJourney(input({ applicationStatus: 'VISA_PROCESSING' }))
    expect(stage(journey, 'ENGLISH').status).toBe('DONE')
    expect(stage(journey, 'FUNDS').status).toBe('DONE')
    expect(stage(journey, 'VISA').status).toBe('CURRENT')
  })

  it('ticks the profile checklist field by field', () => {
    const journey = deriveJourney(
      input({ profile: { ...fullProfile, intakeSet: false, budgetRange: null, englishTest: null } }),
    )
    expect(stage(journey, 'PROFILE').checklist.map((item) => item.done)).toEqual([
      true,
      true,
      false,
      false,
      true,
      false,
    ])
  })

  it('walks the CHOOSE next steps: pick, share, then say you are ready', () => {
    expect(deriveJourney(input({ shortlistCount: 2 })).nextStep).toMatchObject({
      title: 'Pick your programme',
      action: { target: 'PLAN' },
    })

    const chosen = deriveJourney(input({ shortlistCount: 1, hasChoice: true }))
    expect(chosen.nextStep).toMatchObject({ title: 'Share your study plan', action: { target: 'STUDY_PLAN' } })
    expect(stage(chosen, 'CHOOSE').checklist.map((item) => item.done)).toEqual([true, false])

    const shared = deriveJourney(input({ shortlistCount: 1, hasChoice: true, studyPlanShared: true }))
    expect(shared.nextStep.title).toBe("Tell us you're ready to apply")
    expect(stage(shared, 'CHOOSE').checklist.map((item) => item.done)).toEqual([true, true])
  })

  it('names the advisor, or falls back when there is none', () => {
    expect(deriveJourney(input({ applicationStatus: 'DRAFT' })).nextStep).toMatchObject({
      description: "Amina Yusuf will tell you exactly what's needed.",
      action: { label: 'Message Amina', target: 'CHAT' },
    })
    expect(deriveJourney(input({ applicationStatus: 'DRAFT', advisorName: null })).nextStep).toMatchObject({
      description: "Your advisor will tell you exactly what's needed.",
      action: { label: 'Open chat' },
    })
  })

  it('lets the student tick deposit and English, but not proof of funds', () => {
    const journey = deriveJourney(input({ profile: noScore, applicationStatus: 'OFFER_RECEIVED' }))
    const items = [...stage(journey, 'OFFER').checklist, ...stage(journey, 'ENGLISH').checklist, ...stage(journey, 'FUNDS').checklist]
    expect(items.map((item) => [item.checkKey, item.canTick])).toEqual([
      [null, false], // Offer received: from the application
      ['DEPOSIT_PAID', true],
      ['ENGLISH_TEST_BOOKED', true],
      ['ENGLISH_SCORE_RECEIVED', true],
      ['FUNDS_PLAN_AGREED', false],
      ['FUNDS_DOCUMENTS_READY', false],
    ])
  })

  it('lets staff tick every hand-ticked step', () => {
    const journey = deriveJourney(input({ profile: noScore, applicationStatus: 'OFFER_RECEIVED' }), 'STAFF')
    expect(stage(journey, 'FUNDS').checklist.every((item) => item.canTick)).toBe(true)
    expect(stage(journey, 'OFFER').checklist[0]!.canTick).toBe(false)
  })

  it('locks items the data already makes done', () => {
    // An actual English result ticks both English items, and they can't be unticked.
    const withScore = deriveJourney(input({ applicationStatus: 'OFFER_RECEIVED' }))
    expect(stage(withScore, 'ENGLISH').checklist.map((i) => [i.done, i.canTick])).toEqual([
      [true, false],
      [true, false],
    ])
    // Past the visa step, untouched earlier checks show done but stay locked...
    const visa = deriveJourney(input({ profile: noScore, applicationStatus: 'VISA_PROCESSING' }))
    expect(stage(visa, 'FUNDS').checklist.map((i) => [i.done, i.canTick])).toEqual([
      [true, false],
      [true, false],
    ])
    // ...while a real tick in a done stage can still be undone.
    const ticked = deriveJourney(
      input({ profile: noScore, applicationStatus: 'VISA_PROCESSING', checks: checks('ENGLISH_TEST_BOOKED') }),
    )
    expect(stage(ticked, 'ENGLISH').checklist[0]).toMatchObject({ done: true, canTick: true })
  })

  it('switches the English next step once the test is booked', () => {
    const booked = deriveJourney(
      input({
        profile: noScore,
        applicationStatus: 'OFFER_RECEIVED',
        checks: checks('DEPOSIT_PAID', 'ENGLISH_TEST_BOOKED'),
      }),
    )
    expect(booked.currentStage).toBe('ENGLISH')
    expect(booked.nextStep.title).toBe('Waiting for your English score')
    expect(stage(booked, 'ENGLISH').checklist.map((i) => i.done)).toEqual([true, false])
  })

  it('ends with no action once the visa step is complete', () => {
    const journey = deriveJourney(input({ applicationStatus: 'COMPLETED' }))
    expect(journey.nextStep).toEqual({
      title: "You're all set",
      description: 'Your visa step is complete. Safe travels!',
      action: null,
    })
    expect(stage(journey, 'VISA').checklist.every((item) => item.done)).toBe(true)
  })
})
