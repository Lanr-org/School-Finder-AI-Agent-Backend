import { describe, expect, it } from 'vitest'
import {
  currentStageFor,
  deriveJourney,
  mostAdvancedOpenApplication,
} from '../src/modules/studentPortal/studentJourney'
import type { JourneyInput } from '../src/modules/studentPortal/studentPortal.types'

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
  ...overrides,
})

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
