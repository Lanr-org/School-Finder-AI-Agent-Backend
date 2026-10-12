import { z } from 'zod'
import { createError } from '../../common/errors/AppError'
import { logger } from '../../config/logger.js'
import { captureError } from '../../config/sentry.js'
import {
  PageFetchError,
  fetchPageText,
} from '../../integrations/web/fetchPage.js'
import { llmClient } from '../../integrations/llm/index.js'
import { AiUsageService } from '../ai/aiUsage.service.js'
import { parseModelJson } from '../interview/interview.parse.js'
import { intakeMonthEnum } from './programs.schemas'
import {
  PROGRAM_EXTRACT_SYSTEM_PROMPT,
  buildProgramExtractMessage,
} from './programs.extract.prompt'

// ── What the model sends back (lenient; the guard below decides what survives) ──
const quoted = <T extends z.ZodType>(value: T) =>
  z.object({ value, quote: z.string() }).nullable().optional()

const amountSchema = z.preprocess(
  (value) =>
    typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : value,
  z.number(),
)

export const extractionOutputSchema = z.object({
  name: quoted(z.string()),
  studyLevel: quoted(z.string()),
  qualification: quoted(z.string()),
  duration: quoted(z.string()),
  tuitionAmount: quoted(amountSchema),
  tuitionCurrency: quoted(z.string()),
  feePeriod: quoted(z.string()),
  feesAcademicYear: quoted(z.string()),
  intakes: z
    .array(
      z.object({
        month: z.string(),
        year: z.number().int().nullable().optional(),
        quote: z.string(),
      }),
    )
    .nullable()
    .optional(),
  academicRequirements: quoted(z.string()),
  englishRequirements: quoted(z.string()),
  scholarshipAvailability: quoted(z.string()),
})
export type ExtractionOutput = z.infer<typeof extractionOutputSchema>

const STUDY_LEVELS = [
  'UNDERGRADUATE',
  'POSTGRADUATE',
  'DOCTORATE',
  'FOUNDATION',
] as const
type StudyLevel = (typeof STUDY_LEVELS)[number]
type IntakeMonth = z.infer<typeof intakeMonthEnum>

export type ProgramDraft = {
  name?: string
  studyLevel?: StudyLevel
  qualification?: string
  duration?: string
  tuitionAmount?: number
  tuitionCurrency?: string
  feesAcademicYear?: string
  intakes?: { month: IntakeMonth; year: number }[]
  academicRequirements?: string
  englishRequirements?: string
  scholarshipAvailability?: string
}

export type ProgramExtractResult = {
  sourceUrl: string | null
  draft: ProgramDraft
  evidence: Record<string, string>
  dropped: string[]
  warnings: string[]
}

// ── Quote guard ──────────────────────────────────────────────────────────────
// Compare text the way a person would: ignore case, curly quotes, dash styles, spacing.
export const normalizeForQuote = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/([£$€])\s+/g, '$1')
    .trim()

const MIN_QUOTE_LENGTH = 8
const MAX_QUOTE_LENGTH = 2000

const onPage = (quote: string, page: string) => {
  const needle = normalizeForQuote(quote)
  return (
    needle.length >= MIN_QUOTE_LENGTH &&
    needle.length <= MAX_QUOTE_LENGTH &&
    page.includes(needle)
  )
}

// "£19,950", "19 950 €", "19.950,00 EUR": does any number in the quote equal the amount?
export const quoteHasAmount = (quote: string, amount: number) =>
  (quote.match(/\d[\d,.\s]*\d|\d/g) ?? []).some((raw) => {
    const plain = Number(raw.replace(/[\s,]/g, ''))
    const european = Number(raw.replace(/[\s.]/g, '').replace(',', '.'))
    return plain === amount || european === amount
  })

const CURRENCY_SIGNS: Record<string, RegExp> = {
  GBP: /£|\bgbp\b|pound/i,
  EUR: /€|\beur\b|euro/i,
  USD: /\$|\busd\b/i,
  CAD: /\$|\bcad\b/i,
  AUD: /\$|\baud\b/i,
}

// "2026/27", "2026-27", "2026/2027", "2026 to 2027", "2026 entry" -> "2026/27"
export const normalizeAcademicYear = (value: string): string | null => {
  const range = /(20\d{2})\s*(?:\/|-|–|to)\s*(?:20)?(\d{2})\b/.exec(value)
  if (range)
    return Number(range[2]) === (Number(range[1]) + 1) % 100
      ? `${range[1]}/${range[2]}`
      : null
  const single = /\b(20\d{2})\b/.exec(value)
  return single
    ? `${single[1]}/${String((Number(single[1]) + 1) % 100).padStart(2, '0')}`
    : null
}

const MONTH_PATTERNS: Record<IntakeMonth, RegExp> = {
  JANUARY: /\bjan(uary)?\b/i,
  FEBRUARY: /\bfeb(ruary)?\b/i,
  MARCH: /\bmar(ch)?\b/i,
  APRIL: /\bapr(il)?\b/i,
  MAY: /\bmay\b/i,
  JUNE: /\bjune?\b/i,
  JULY: /\bjuly?\b/i,
  AUGUST: /\baug(ust)?\b/i,
  SEPTEMBER: /\bsept?(ember)?\b/i,
  OCTOBER: /\boct(ober)?\b/i,
  NOVEMBER: /\bnov(ember)?\b/i,
  DECEMBER: /\bdec(ember)?\b/i,
}

// Academic years start in September: in October 2026 the current one is 2026/27.
const currentAcademicYearStart = (now: Date) =>
  now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1

// Keeps only what can be found, word for word, on the page. Pure; the main safety net.
export const guardExtraction = (
  output: ExtractionOutput,
  pageText: string,
  now = new Date(),
): Omit<ProgramExtractResult, 'sourceUrl'> => {
  const page = normalizeForQuote(pageText)
  const draft: ProgramDraft = {}
  const evidence: Record<string, string> = {}
  const dropped: string[] = []
  const warnings: string[] = []

  const keep = <K extends keyof ProgramDraft>(
    field: K,
    value: ProgramDraft[K],
    quote: string,
  ) => {
    draft[field] = value
    evidence[field] = quote.trim().slice(0, MAX_QUOTE_LENGTH)
  }
  const drop = (field: string) => {
    if (!dropped.includes(field)) dropped.push(field)
  }

  // Short text facts: the quote must be on the page. The course name must be too, word for word.
  for (const field of [
    'name',
    'qualification',
    'duration',
    'scholarshipAvailability',
  ] as const) {
    const item = output[field]
    if (!item) continue
    const value = item.value
      .trim()
      .slice(0, field === 'scholarshipAvailability' ? 100 : 200)
    const valueOnPage =
      field !== 'name' || page.includes(normalizeForQuote(value))
    if (value !== '' && valueOnPage && onPage(item.quote, page)) {
      keep(field, value, item.quote)
    } else drop(field)
  }

  if (output.studyLevel) {
    const level = output.studyLevel.value.trim().toUpperCase()
    if (
      (STUDY_LEVELS as readonly string[]).includes(level) &&
      onPage(output.studyLevel.quote, page)
    ) {
      keep('studyLevel', level as StudyLevel, output.studyLevel.quote)
    } else drop('studyLevel')
  }

  // Requirements: every sentence of the value must itself be on the page, so it can be
  // shortened but never reworded.
  for (const field of [
    'academicRequirements',
    'englishRequirements',
  ] as const) {
    const item = output[field]
    if (!item) continue
    const sentences = item.value
      .split(/(?<=[.;])\s+|\n+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence !== '')
    const verbatim =
      sentences.length > 0 &&
      sentences.every((sentence) =>
        page.includes(normalizeForQuote(sentence)),
      ) &&
      onPage(item.quote, page)
    if (verbatim) keep(field, item.value.trim().slice(0, 5000), item.quote)
    else drop(field)
  }

  // Fee: on the page, and the number really is in its quote.
  const fee = output.tuitionAmount
  if (fee) {
    if (
      Number.isFinite(fee.value) &&
      fee.value > 0 &&
      onPage(fee.quote, page) &&
      quoteHasAmount(fee.quote, fee.value)
    ) {
      keep('tuitionAmount', fee.value, fee.quote)
      if (
        !/international|overseas|non-eu|non-uk|outside the (uk|eu)/i.test(
          fee.quote,
        )
      ) {
        warnings.push(
          'Check this is the international fee: the quoted line does not say so.',
        )
      }
    } else drop('tuitionAmount')
  }

  const currency = output.tuitionCurrency
  if (currency) {
    const code = currency.value.trim().toUpperCase()
    const sign = CURRENCY_SIGNS[code] ?? new RegExp(`\\b${code}\\b`, 'i')
    if (
      /^[A-Z]{3}$/.test(code) &&
      onPage(currency.quote, page) &&
      sign.test(currency.quote)
    ) {
      keep('tuitionCurrency', code, currency.quote)
    } else drop('tuitionCurrency')
  }

  if (
    output.feePeriod &&
    draft.tuitionAmount !== undefined &&
    onPage(output.feePeriod.quote, page)
  ) {
    const period = output.feePeriod.value.trim().toUpperCase()
    if (period === 'SEMESTER')
      warnings.push(
        'The fee is per semester; the form stores the fee per year.',
      )
    if (period === 'TOTAL')
      warnings.push(
        'The fee is for the whole course; the form stores the fee per year.',
      )
  }

  const year = output.feesAcademicYear
  if (year) {
    const normalized = normalizeAcademicYear(year.value)
    const start = normalized?.slice(0, 4)
    if (
      normalized &&
      start &&
      onPage(year.quote, page) &&
      year.quote.includes(start)
    ) {
      keep('feesAcademicYear', normalized, year.quote)
      if (Number(start) < currentAcademicYearStart(now)) {
        warnings.push(
          `The fees are for ${normalized}, an earlier year. Look for newer fees.`,
        )
      }
    } else drop('feesAcademicYear')
  }
  if (
    draft.tuitionAmount !== undefined &&
    draft.feesAcademicYear === undefined
  ) {
    warnings.push('The page does not say which year the fee is for.')
  }

  // Intakes: the month must be in its own quote; a year the page doesn't state can't be kept.
  const intakes: { month: IntakeMonth; year: number }[] = []
  for (const intake of output.intakes ?? []) {
    const month = intakeMonthEnum.safeParse(intake.month.trim().toUpperCase())
    const validQuote =
      month.success &&
      onPage(intake.quote, page) &&
      MONTH_PATTERNS[month.data].test(intake.quote)
    if (
      !validQuote ||
      !intake.year ||
      intake.year < 2000 ||
      intake.year > 2100
    ) {
      drop('intakes')
      continue
    }
    if (
      intakes.some(
        (existing) =>
          existing.month === month.data && existing.year === intake.year,
      )
    )
      continue
    evidence[`intakes.${intakes.length}`] = intake.quote
      .trim()
      .slice(0, MAX_QUOTE_LENGTH)
    intakes.push({ month: month.data, year: intake.year })
  }
  if (intakes.length > 0) draft.intakes = intakes

  return { draft, evidence, dropped, warnings }
}

// ── Service ──────────────────────────────────────────────────────────────────
const MAX_TEXT_FOR_MODEL = 60_000
const TRY_AGAIN =
  "We couldn't read the course details. Please try again, or fill the form by hand."

export const ProgramExtractService = {
  ExtractDraft: async ({
    url,
    pageText,
  }: {
    url?: string
    pageText?: string
  }): Promise<ProgramExtractResult> => {
    let text: string
    let sourceUrl = url ?? null
    if (pageText) {
      text = pageText
    } else {
      try {
        const page = await fetchPageText(url!)
        text = page.text
        sourceUrl = page.url
      } catch (error) {
        if (error instanceof PageFetchError) {
          throw createError(
            error.message,
            400,
            { url: [error.message] },
            'VALIDATION_ERROR',
          )
        }
        throw error
      }
    }
    text = text.slice(0, MAX_TEXT_FOR_MODEL)

    const usage = await AiUsageService.TryConsumeGlobal()
    if (!usage.allowed) {
      throw createError(
        'The AI is busy for today. Please fill the form by hand.',
        429,
        {},
        'RATE_LIMITED',
      )
    }

    let raw: string
    try {
      raw = await llmClient.generateReply(
        [
          {
            role: 'user',
            content: buildProgramExtractMessage(text, sourceUrl),
          },
        ],
        PROGRAM_EXTRACT_SYSTEM_PROMPT,
      )
    } catch (error) {
      logger.warn({ err: error }, 'Programme extraction LLM call failed.')
      captureError(error, { tags: { area: 'program-extract' } })
      throw Object.assign(createError(TRY_AGAIN, 500, {}, 'INTERNAL_ERROR'), {
        reported: true,
      })
    }

    const output = parseModelJson(raw, extractionOutputSchema)
    if (!output) {
      logger.warn(
        'Programme extraction reply was not valid JSON for the expected shape.',
      )
      captureError(new Error('Programme extraction reply was not valid JSON'), {
        tags: { area: 'program-extract' },
      })
      throw Object.assign(createError(TRY_AGAIN, 500, {}, 'INTERNAL_ERROR'), {
        reported: true,
      })
    }

    const result = { sourceUrl, ...guardExtraction(output, text) }
    logger.info(
      {
        host: sourceUrl ? new URL(sourceUrl).hostname : null,
        pasted: Boolean(pageText),
        kept: Object.keys(result.draft).length,
        dropped: result.dropped,
      },
      'Programme draft extracted.',
    )
    return result
  },
}
