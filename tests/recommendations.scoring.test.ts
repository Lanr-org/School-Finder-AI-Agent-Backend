import { describe, expect, it } from 'vitest'
import {
  computeOverallScore,
  scoreBudgetFit,
  scoreIntakeFit,
  scoreProgramFit,
  scoreVisaFit,
  type CandidateProgram,
  type CandidateStudent,
  type VisaRate,
} from '../src/modules/recommendations/recommendations.scoring'

const makeStudent = (
  overrides: Record<string, unknown> = {},
): CandidateStudent =>
  ({
    study_level: null,
    academic_background: null,
    english_test_score: null,
    budget_range: null,
    target_intake_month: null,
    target_intake_year: null,
    ...overrides,
  }) as any

const makeProgram = (
  overrides: Record<string, unknown> = {},
): CandidateProgram =>
  ({
    study_level: 'UNDERGRADUATE',
    academic_requirements: null,
    english_requirements: null,
    tuition_amount: 15000,
    tuition_currency: 'GBP',
    scholarship_availability: null,
    intakes: [],
    school: {
      name: 'University of East London',
      city: 'London',
      public_id: 'SCH-4667',
      country: 'United Kingdom',
      visa_friendliness_score: null,
    },
    ...overrides,
  }) as any

describe('scoreProgramFit', () => {
  it('flags a missing requirement when study level is unspecified, still crediting absent program requirements', () => {
    const result = scoreProgramFit(makeStudent(), makeProgram())
    // base 50 (unknown study level) + 15 (no academic requirements text) + 15 (no english requirements text)
    expect(result.score).toBe(80)
    expect(result.missingRequirements).toContain('Study level not specified')
  })

  it('scores highest when study level matches and no requirement text exists', () => {
    const result = scoreProgramFit(
      makeStudent({ study_level: 'undergraduate degree' }),
      makeProgram({ study_level: 'UNDERGRADUATE' }),
    )
    expect(result.score).toBe(100)
  })

  it('scores lower when study level mismatches', () => {
    const result = scoreProgramFit(
      makeStudent({ study_level: 'currently doing a PhD' }),
      makeProgram({ study_level: 'UNDERGRADUATE' }),
    )
    expect(result.score).toBe(50)
  })

  it('flags missing academic background when the program has requirements text', () => {
    const result = scoreProgramFit(
      makeStudent(),
      makeProgram({ academic_requirements: 'Minimum 2:1 degree' }),
    )
    expect(result.missingRequirements).toContain(
      'Academic background not provided — cannot verify against entry requirements',
    )
  })

  it('rewards having academic background and english score on file against requirements', () => {
    const result = scoreProgramFit(
      makeStudent({
        study_level: 'undergraduate degree',
        academic_background: 'BSc Computer Science',
        english_test_score: 'IELTS 7.0',
      }),
      makeProgram({
        study_level: 'UNDERGRADUATE',
        academic_requirements: 'Minimum 2:1 degree',
        english_requirements: 'IELTS 6.5',
      }),
    )
    expect(result.score).toBe(100)
    expect(result.missingRequirements).toHaveLength(0)
  })
})

describe('scoreBudgetFit', () => {
  it('gives a neutral score and flags missing budget when unparseable', () => {
    const result = scoreBudgetFit(
      makeStudent({ budget_range: 'flexible' }),
      makeProgram(),
    )
    expect(result.score).toBe(50)
    expect(result.missingRequirements).toContain(
      'Budget not specified or not parseable',
    )
  })

  it('scores 100 when tuition is within a parsed budget ceiling', () => {
    const result = scoreBudgetFit(
      makeStudent({ budget_range: '$10k-$20k' }),
      makeProgram({ tuition_amount: 15000 }),
    )
    expect(result.score).toBe(100)
  })

  it('scores 0 when tuition is at least double the budget ceiling', () => {
    const result = scoreBudgetFit(
      makeStudent({ budget_range: 'under 10000' }),
      makeProgram({ tuition_amount: 25000 }),
    )
    expect(result.score).toBe(0)
  })

  it('tapers the score down for tuition moderately over budget', () => {
    const result = scoreBudgetFit(
      makeStudent({ budget_range: '10000' }),
      makeProgram({ tuition_amount: 12000 }),
    )
    expect(result.score).toBe(80)
  })

  it('adds a scholarship bonus capped at 100', () => {
    const result = scoreBudgetFit(
      makeStudent({ budget_range: '20000' }),
      makeProgram({ tuition_amount: 15000, scholarship_availability: 'Full' }),
    )
    expect(result.score).toBe(100)
    expect(result.reasons.some((r) => r.includes('Scholarship'))).toBe(true)
  })
})

describe('scoreIntakeFit', () => {
  it('gives a neutral score and flags missing intake when unspecified', () => {
    const result = scoreIntakeFit(makeStudent(), makeProgram())
    expect(result.score).toBe(50)
    expect(result.missingRequirements).toContain('Target intake not specified')
  })

  it('scores 100 on an exact month+year match', () => {
    const result = scoreIntakeFit(
      makeStudent({
        target_intake_month: 'SEPTEMBER',
        target_intake_year: 2026,
      }),
      makeProgram({ intakes: [{ month: 'SEPTEMBER', year: 2026 }] }),
    )
    expect(result.score).toBe(100)
  })

  it('scores 70 when only the year matches', () => {
    const result = scoreIntakeFit(
      makeStudent({
        target_intake_month: 'SEPTEMBER',
        target_intake_year: 2026,
      }),
      makeProgram({ intakes: [{ month: 'JANUARY', year: 2026 }] }),
    )
    expect(result.score).toBe(70)
  })

  it('scores 40 when a later intake exists but not in the target year', () => {
    const result = scoreIntakeFit(
      makeStudent({
        target_intake_month: 'SEPTEMBER',
        target_intake_year: 2026,
      }),
      makeProgram({ intakes: [{ month: 'JANUARY', year: 2027 }] }),
    )
    expect(result.score).toBe(40)
  })

  it('scores 0 and flags when no upcoming intake exists', () => {
    const result = scoreIntakeFit(
      makeStudent({
        target_intake_month: 'SEPTEMBER',
        target_intake_year: 2026,
      }),
      makeProgram({ intakes: [{ month: 'JANUARY', year: 2025 }] }),
    )
    expect(result.score).toBe(0)
    expect(result.missingRequirements).toContain(
      'No matching or upcoming intake available',
    )
  })
})

describe('scoreVisaFit', () => {
  const makeRate = (overrides: Record<string, unknown> = {}): VisaRate =>
    ({
      country: 'United Kingdom',
      success_rate: 80,
      period_label: 'Q3 2026',
      source_partner: null,
      ...overrides,
    }) as any

  it('gives a neutral score and flags missing data when no signal exists', () => {
    const result = scoreVisaFit(makeProgram(), new Map())
    expect(result.score).toBe(50)
    expect(result.missingRequirements).toHaveLength(1)
  })

  it('uses the school visa-friendliness score alone when no country rate exists', () => {
    const result = scoreVisaFit(
      makeProgram({
        school: { country: 'United Kingdom', visa_friendliness_score: 90 },
      }),
      new Map(),
    )
    expect(result.score).toBe(90)
  })

  it('averages the school score and the country rate when both exist', () => {
    const lookup = new Map([['united kingdom', makeRate({ success_rate: 70 })]])
    const result = scoreVisaFit(
      makeProgram({
        school: { country: 'United Kingdom', visa_friendliness_score: 90 },
      }),
      lookup,
    )
    expect(result.score).toBe(80)
  })
})

describe('computeOverallScore', () => {
  it('applies the AGENTS.md weighted formula', () => {
    const overall = computeOverallScore(
      {
        program: { score: 80, reasons: [], missingRequirements: [] },
        budget: { score: 100, reasons: [], missingRequirements: [] },
        intake: { score: 70, reasons: [], missingRequirements: [] },
        visa: { score: 50, reasons: [], missingRequirements: [] },
      },
      { programWeight: 35, budgetWeight: 25, intakeWeight: 20, visaWeight: 20 },
    )
    // (80*35 + 100*25 + 70*20 + 50*20) / 100 = (2800+2500+1400+1000)/100 = 77
    expect(overall).toBe(77)
  })
})
