import { describe, expect, it } from 'vitest'
import {
  fillBlanks,
  hasStaffWork,
  identitiesClash,
  pickSurvivor,
  type MergeSide,
} from '../src/modules/studentLink/studentLink.rules'

const side = (overrides: Record<string, unknown> = {}, count: Partial<MergeSide['_count']> = {}) =>
  ({
    id: 'student',
    public_id: 'STU-0001',
    created_at: new Date('2026-09-01'),
    assigned_advisor_id: null,
    study_level: null,
    target_destinations: [],
    target_intake_month: null,
    target_intake_year: null,
    budget_range: null,
    academic_background: null,
    english_test_score: null,
    chosen_program_id: null,
    study_plan_shared_at: null,
    identities: [],
    _count: { applications: 0, notes: 0, follow_ups: 0, recommendation_runs: 0, ...count },
    ...overrides,
  }) as unknown as MergeSide

describe('hasStaffWork', () => {
  it('is false for a plain lead', () => {
    expect(hasStaffWork(side())).toBe(false)
  })

  it.each([
    ['an assigned advisor', side({ assigned_advisor_id: 'advisor' })],
    ['an application', side({}, { applications: 1 })],
    ['a note', side({}, { notes: 2 })],
    ['a follow-up', side({}, { follow_ups: 1 })],
    ['a recommendation run', side({}, { recommendation_runs: 1 })],
  ])('is true with %s', (_label, student) => {
    expect(hasStaffWork(student)).toBe(true)
  })
})

describe('pickSurvivor', () => {
  const older = side({ id: 'older', created_at: new Date('2026-08-01') })
  const newer = side({ id: 'newer', created_at: new Date('2026-09-20') })

  it('keeps the older student when neither has staff work', () => {
    expect(pickSurvivor(newer, older)?.map((s) => s.id)).toEqual(['older', 'newer'])
  })

  it('keeps the student with staff work, even if newer', () => {
    const worked = side({ id: 'worked', created_at: new Date('2026-09-25') }, { notes: 1 })
    expect(pickSurvivor(older, worked)?.map((s) => s.id)).toEqual(['worked', 'older'])
  })

  it('refuses when both have staff work', () => {
    expect(pickSurvivor(side({}, { notes: 1 }), side({ assigned_advisor_id: 'advisor' }))).toBeNull()
  })
})

describe('identitiesClash', () => {
  const google = (subject: string) => ({ provider: 'GOOGLE', subject })
  const telegram = (subject: string) => ({ provider: 'TELEGRAM', subject })

  it('is false when each side has a different kind of account', () => {
    expect(identitiesClash(side({ identities: [google('g1')] }), side({ identities: [telegram('t1')] }))).toBe(false)
  })

  it('is true when both have a different account of the same kind', () => {
    expect(identitiesClash(side({ identities: [google('g1')] }), side({ identities: [google('g2')] }))).toBe(true)
  })
})

describe('fillBlanks', () => {
  it("keeps the survivor's values and fills only its blanks", () => {
    const survivor = side({ study_level: 'MASTERS', target_destinations: ['UK'] })
    const absorbed = side({
      study_level: 'BACHELORS',
      target_destinations: ['CANADA'],
      target_intake_month: 'SEPTEMBER',
      target_intake_year: 2027,
      budget_range: 'Up to £25k',
      chosen_program_id: 'program-1',
    })

    expect(fillBlanks(survivor, absorbed)).toMatchObject({
      study_level: 'MASTERS',
      target_destinations: ['UK'],
      target_intake_month: 'SEPTEMBER',
      target_intake_year: 2027,
      budget_range: 'Up to £25k',
      chosen_program_id: 'program-1',
    })
  })

  it('keeps a complete survivor intake as a pair', () => {
    const survivor = side({ target_intake_month: 'JANUARY', target_intake_year: 2028 })
    const absorbed = side({ target_intake_month: 'SEPTEMBER', target_intake_year: 2027 })
    expect(fillBlanks(survivor, absorbed)).not.toHaveProperty('target_intake_month')
  })
})
