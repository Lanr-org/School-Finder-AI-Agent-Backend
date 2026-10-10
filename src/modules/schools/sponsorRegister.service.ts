import { logger } from '../../config/logger.js'
import { runInTransaction } from '../../database/transaction.js'
import type { VisaSponsorStatus } from '../../generated/prisma/index.js'
import {
  UK_REGISTER_SOURCE,
  fetchUkSponsorRegister,
  type SponsorRegisterRow,
} from '../../integrations/govuk/sponsorRegister.js'
import { AUDIT_ACTIONS } from '../audit/audit.actions.js'
import { AuditService } from '../audit/audit.service.js'
import { NotificationsService } from '../notifications/notifications.service.js'
import TeamRepo from '../team/team.repository.js'
import { SchoolsRepo } from './schools.repository.js'
import {
  buildRegisterIndex,
  isCautionNote,
  isUkCountry,
  matchSchool,
  sponsorNote,
  type SponsorMatch,
} from './sponsorRegister.matching.js'

type SchoolSponsorState = {
  visa_sponsor_status: VisaSponsorStatus
  visa_sponsor_register_name: string | null
  visa_sponsor_note: string | null
}

export type SponsorDecision = { status: VisaSponsorStatus; registerName: string | null; note: string | null }

// A match means licensed. No match only means "not listed" for a school that WAS licensed (it
// dropped off the register); otherwise the name may simply differ, so we say so and don't guess.
export const decideSponsorStatus = (school: SchoolSponsorState, match: SponsorMatch): SponsorDecision => {
  if (match.kind === 'matched') {
    return { status: 'LICENSED', registerName: match.row.sponsorName, note: sponsorNote(match.row) }
  }
  if (school.visa_sponsor_status === 'LICENSED' || school.visa_sponsor_status === 'NOT_LISTED') {
    return {
      status: 'NOT_LISTED',
      registerName: school.visa_sponsor_register_name,
      note: 'No longer on the register',
    }
  }
  return {
    status: 'UNKNOWN',
    registerName: null,
    note:
      match.reason === 'ambiguous'
        ? 'Several register entries match this name; check the school name'
        : 'Name not found on the register; it may not be licensed, or the name differs',
  }
}

export type SponsorSyncSummary = {
  csvUrl: string
  checkedAt: string
  ukSchools: number
  licensed: number
  notListed: number
  unmatched: { publicId: string; name: string; note: string | null }[]
  changed: number
}

export const SponsorRegisterService = {
  // Rows are passed in by tests; production downloads the current register.
  SyncUk: async (
    source?: { csvUrl: string; rows: SponsorRegisterRow[] },
  ): Promise<SponsorSyncSummary> => {
    const { csvUrl, rows } = source ?? (await fetchUkSponsorRegister())
    const index = buildRegisterIndex(rows)
    if (index.size === 0) {
      // An empty or unreadable register must never mark every school "not listed".
      throw new Error('Sponsor register has no Student-route sponsors; refusing to sync')
    }

    const checkedAt = new Date()
    const schools = (await SchoolsRepo.listSchoolsForSponsorCheck()).filter((school) => isUkCountry(school.country))
    const decisions = schools.map((school) => ({
      school,
      decision: decideSponsorStatus(school, matchSchool(school, index)),
    }))

    const changes = decisions.filter(
      ({ school, decision }) =>
        school.visa_sponsor_status !== decision.status ||
        school.visa_sponsor_register_name !== decision.registerName ||
        school.visa_sponsor_note !== decision.note,
    )

    await runInTransaction(async (tx) => {
      for (const { school, decision } of decisions) {
        await SchoolsRepo.setSponsorCheck(
          school.id,
          { ...decision, source: UK_REGISTER_SOURCE, checkedAt },
          tx,
        )
      }
      // Audit only real changes; a daily "still licensed" isn't news.
      for (const { school, decision } of changes) {
        await AuditService.record(tx, {
          action: AUDIT_ACTIONS.SCHOOL_SPONSOR_STATUS_CHANGED,
          entityType: 'school',
          entityId: school.public_id,
          before: {
            visaSponsorStatus: school.visa_sponsor_status,
            visaSponsorRegisterName: school.visa_sponsor_register_name,
            visaSponsorNote: school.visa_sponsor_note,
          },
          after: {
            visaSponsorStatus: decision.status,
            visaSponsorRegisterName: decision.registerName,
            visaSponsorNote: decision.note,
          },
          metadata: { csvUrl },
          actorId: null,
          actorRole: null,
        })
      }
    })

    // Tell admins about anything that should change what an advisor tells a student.
    const alerts = changes.filter(
      ({ school, decision }) =>
        (decision.status === 'NOT_LISTED' && school.visa_sponsor_status !== 'NOT_LISTED') ||
        (isCautionNote(decision.note) && !isCautionNote(school.visa_sponsor_note)),
    )
    if (alerts.length > 0) {
      const admins = await TeamRepo.findActiveAdminIds()
      for (const { school, decision } of alerts) {
        await NotificationsService.notify(admins, {
          type: 'SYSTEM',
          title:
            decision.status === 'NOT_LISTED'
              ? `${school.name} is no longer on the UK sponsor register`
              : `${school.name}: ${decision.note ?? 'sponsor status changed'}`,
          body: 'Check before advising students to apply. It may not be able to issue a CAS.',
          link: `/schools/${school.public_id}`,
        })
      }
    }

    const summary: SponsorSyncSummary = {
      csvUrl,
      checkedAt: checkedAt.toISOString(),
      ukSchools: schools.length,
      licensed: decisions.filter(({ decision }) => decision.status === 'LICENSED').length,
      notListed: decisions.filter(({ decision }) => decision.status === 'NOT_LISTED').length,
      unmatched: decisions
        .filter(({ decision }) => decision.status === 'UNKNOWN')
        .map(({ school, decision }) => ({ publicId: school.public_id, name: school.name, note: decision.note })),
      changed: changes.length,
    }
    logger.info({ ...summary, unmatched: summary.unmatched.length }, 'UK sponsor register synced.')
    return summary
  },
}
