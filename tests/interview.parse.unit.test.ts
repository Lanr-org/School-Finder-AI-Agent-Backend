import './setup-env'
import { describe, expect, it } from 'vitest'
import { parseModelJson } from '../src/modules/interview/interview.parse'
import {
  finalTurnOutputSchema,
  firstQuestionOutputSchema,
  nextTurnOutputSchema,
} from '../src/modules/interview/interview.schemas'

describe('parseModelJson', () => {
  it('parses plain JSON', () => {
    expect(parseModelJson('{"question":"Why this course?"}', firstQuestionOutputSchema)).toEqual({
      question: 'Why this course?',
    })
  })

  it('strips markdown fences and surrounding text', () => {
    const raw = 'Sure!\n```json\n{"question":"Why the UK?"}\n```\nHope that helps.'
    expect(parseModelJson(raw, firstQuestionOutputSchema)).toEqual({ question: 'Why the UK?' })
  })

  it.each(['', 'no json here', '{broken', '{"question":""}', '{"other":1}'])(
    'returns null for unusable reply %j',
    (raw) => {
      expect(parseModelJson(raw, firstQuestionOutputSchema)).toBeNull()
    },
  )

  it('clamps out-of-range scores instead of rejecting', () => {
    const parsed = parseModelJson(
      '{"tip":"Good","score":14,"nextQuestion":"What next?"}',
      nextTurnOutputSchema,
    )
    expect(parsed?.score).toBe(10)
  })

  it('parses a final turn and defaults missing lists', () => {
    const parsed = parseModelJson(
      '{"tip":"Fine","score":-2,"summary":"Solid.","overallScore":140}',
      finalTurnOutputSchema,
    )
    expect(parsed).toMatchObject({ score: 0, overallScore: 100, strengths: [], improvements: [] })
  })
})
