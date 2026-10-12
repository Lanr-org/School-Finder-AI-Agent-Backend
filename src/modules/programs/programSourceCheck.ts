import { createError } from '../../common/errors/AppError'
import { logger } from '../../config/logger.js'
import { runInTransaction } from '../../database/transaction.js'
import type { ProgramVerificationStatus } from '../../generated/prisma/index.js'
import {
  PageFetchError,
  fetchPageText,
  type PageFetchErrorKind,
} from '../../integrations/web/fetchPage.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions'
import { AuditService } from '../audit/audit.service'
import { NotificationsService } from '../notifications/notifications.service.js'
import TeamRepo from '../team/team.repository.js'
import { normalizeForQuote } from './programs.extract'
import { ProgramsRepo } from './programs.repository'

// Weekly re-read of every verified programme's course page. No AI: the stored quotes either are
// still on the page or they aren't. It only ever flags NEEDS_RECHECK; a person fixes the data.

const FIELD_LABELS: Record<string, string> = {
  name: 'Program name',
  studyLevel: 'Study level',
  qualification: 'Qualification',
  duration: 'Duration',
  tuitionAmount: 'Tuition',
  tuitionCurrency: 'Currency',
  feesAcademicYear: 'Fees year',
  academicRequirements: 'Academic requirements',
  englishRequirements: 'English requirements',
  scholarshipAvailability: 'Scholarships',
}

const fieldLabel = (field: string) => {
  const intake = /^intakes\.(\d+)$/.exec(field)
  return intake
    ? `Intake ${Number(intake[1]) + 1}`
    : (FIELD_LABELS[field] ?? field)
}

// Field keys whose quote is no longer on the page.
export const checkQuotes = (
  evidence: Record<string, string>,
  pageText: string,
): string[] => {
  const page = normalizeForQuote(pageText)
  return Object.entries(evidence)
    .filter(([, quote]) => !page.includes(normalizeForQuote(quote)))
    .map(([field]) => field)
}

export type SourceOutcome =
  | { kind: 'read'; text: string }
  | { kind: PageFetchErrorKind; message: string }
  | { kind: 'no-source' }

type ProgramForCheck = {
  verified_at: Date | null
  fees_academic_year: string | null
  evidence: unknown
  source_check_failures: number
}

export type SourceCheckDecision = {
  needsRecheck: boolean
  note: string
  failures: number
}

const FAILURES_BEFORE_FLAG = 3
const YEAR_MS = 365 * 24 * 60 * 60 * 1000

// Academic years start in September: in October 2026 the current one is 2026/27.
const currentAcademicYearStart = (now: Date) =>
  now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1

const asEvidence = (value: unknown): Record<string, string> =>
  value !== null && typeof value === 'object'
    ? Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {}

// Pure: what one check means for a programme. The date rules also cover sites we can't read.
export const decideSourceCheck = (
  program: ProgramForCheck,
  outcome: SourceOutcome,
  now: Date,
): SourceCheckDecision => {
  const problems: string[] = []
  let note: string
  let failures = 0

  switch (outcome.kind) {
    case 'read': {
      const evidence = asEvidence(program.evidence)
      const missing = checkQuotes(evidence, outcome.text)
      const total = Object.keys(evidence).length
      if (missing.length > 0) {
        problems.push(
          `Changed on the page: ${missing.map(fieldLabel).join(', ')}`,
        )
      }
      note =
        total === 0
          ? 'Page still online (no quotes stored to compare)'
          : `All ${total} ${total === 1 ? 'quote' : 'quotes'} still on the page`
      break
    }
    case 'gone':
      problems.push('The course page no longer exists')
      note = problems[0]!
      break
    case 'blocked':
      note = 'Site blocks automatic checks; recheck by hand'
      break
    case 'failed':
      failures = program.source_check_failures + 1
      note = `Couldn't open the page (${failures} ${failures === 1 ? 'week' : 'weeks'} running)`
      if (failures >= FAILURES_BEFORE_FLAG) problems.push(note)
      break
    case 'invalid':
      note = `The source link can't be checked: ${outcome.message}`
      break
    case 'no-source':
      note = 'No course page link to check'
      break
  }

  const feesYear = program.fees_academic_year
  if (
    feesYear &&
    Number(feesYear.slice(0, 4)) < currentAcademicYearStart(now)
  ) {
    problems.push(`Fees are for ${feesYear}; check for newer fees`)
  }
  if (
    program.verified_at &&
    now.getTime() - program.verified_at.getTime() > YEAR_MS
  ) {
    problems.push('Last verified over a year ago')
  }

  const text = problems.length > 0 ? problems.join('; ') : note
  return {
    needsRecheck: problems.length > 0,
    note: text.slice(0, 200),
    failures,
  }
}

const readSource = async (sourceUrl: string | null): Promise<SourceOutcome> => {
  if (!sourceUrl) return { kind: 'no-source' }
  try {
    const page = await fetchPageText(sourceUrl)
    return { kind: 'read', text: page.text }
  } catch (error) {
    if (error instanceof PageFetchError)
      return { kind: error.kind, message: error.message }
    return { kind: 'failed', message: (error as Error).message }
  }
}

type ProgramRow = NonNullable<
  Awaited<ReturnType<typeof ProgramsRepo.findProgramByPublicId>>
>
type CheckResult = { flagged: boolean; outcome: SourceOutcome['kind'] }

const checkProgram = async (
  program: ProgramRow,
  { system }: { system: boolean },
  recipients: () => Promise<string[]>,
): Promise<CheckResult> => {
  const outcome = await readSource(program.source_url)
  const decision = decideSourceCheck(program, outcome, new Date())
  // Only a verified programme can drop to NEEDS_RECHECK; one already flagged isn't alerted again.
  const flagged =
    decision.needsRecheck && program.verification_status === 'VERIFIED'
  const status: ProgramVerificationStatus | undefined = flagged
    ? 'NEEDS_RECHECK'
    : undefined

  await runInTransaction(async (tx) => {
    await ProgramsRepo.setSourceCheck(
      program.id,
      {
        status,
        note: decision.note,
        failures: decision.failures,
        checkedAt: new Date(),
      },
      tx,
    )
    if (flagged) {
      await AuditService.record(tx, {
        action: AUDIT_ACTIONS.PROGRAM_SOURCE_CHANGED,
        entityType: 'program',
        entityId: program.public_id,
        before: { verificationStatus: program.verification_status },
        after: {
          verificationStatus: 'NEEDS_RECHECK',
          sourceCheckNote: decision.note,
        },
        metadata: { sourceUrl: program.source_url },
        ...(system && { actorId: null, actorRole: null }),
      })
    }
  })

  if (flagged) {
    await NotificationsService.notify(await recipients(), {
      type: 'SYSTEM',
      title: `${program.name} (${program.school.name}) needs a recheck`,
      body: decision.note,
      link: `/programs/${program.public_id}`,
    })
  }
  return { flagged, outcome: outcome.kind }
}

const managers = () =>
  TeamRepo.findActiveUserIdsByRoles(['ADMIN', 'OPERATIONS'])

const SAME_HOST_DELAY_MS = 2000
const hostOf = (url: string | null) => {
  try {
    return url ? new URL(url).hostname : null
  } catch {
    return null
  }
}

export type SourceCheckSummary = {
  checked: number
  unchanged: number
  flagged: number
  blocked: number
  failed: number
}

export const ProgramSourceCheckService = {
  // "Check the page now" from the hub. Returns nothing; the caller reloads the programme.
  CheckOne: async (programId: string) => {
    const program = await ProgramsRepo.findProgramByPublicId(programId)
    if (!program) throw createError('Program not found', 404, {}, 'NOT_FOUND')
    return checkProgram(program, { system: false }, managers)
  },

  // The weekly job: every verified programme, one at a time, gently on each university's site.
  CheckAllVerified: async (
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) => {
    const programs = await ProgramsRepo.listVerifiedForSourceCheck()
    const summary: SourceCheckSummary = {
      checked: 0,
      unchanged: 0,
      flagged: 0,
      blocked: 0,
      failed: 0,
    }
    let recipientIds: string[] | null = null
    const recipients = async () => (recipientIds ??= await managers())

    let lastHost: string | null = null
    for (const program of programs) {
      const host = hostOf(program.source_url)
      if (host !== null && host === lastHost) await sleep(SAME_HOST_DELAY_MS)
      lastHost = host
      try {
        const result = await checkProgram(program, { system: true }, recipients)
        summary.checked++
        if (result.flagged) summary.flagged++
        else if (result.outcome === 'blocked') summary.blocked++
        else if (result.outcome === 'failed') summary.failed++
        else summary.unchanged++
      } catch (error) {
        // One bad record must not stop the rest of the week's checks.
        summary.failed++
        logger.error(
          { err: error, programId: program.public_id },
          'Programme source check failed.',
        )
      }
    }
    logger.info(summary, 'Weekly programme source check finished.')
    return summary
  },
}
