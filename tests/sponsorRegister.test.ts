import './setup-env'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import app from '../src/app'
import { generateAcessToken } from '../src/common/security/token'
import AuthRepo from '../src/modules/auth/auth.repository'
import { AuditRepo } from '../src/modules/audit/audit.repository'
import { NotificationsService } from '../src/modules/notifications/notifications.service'
import TeamRepo from '../src/modules/team/team.repository'
import { SchoolsRepo } from '../src/modules/schools/schools.repository'
import {
  findRegisterCsvUrl,
  parseRegisterCsv,
} from '../src/integrations/govuk/sponsorRegister'
import {
  buildRegisterIndex,
  isUkCountry,
  matchSchool,
  normalizeSponsorName,
} from '../src/modules/schools/sponsorRegister.matching'
import {
  SponsorRegisterService,
  decideSponsorStatus,
} from '../src/modules/schools/sponsorRegister.service'

vi.mock('../src/modules/auth/auth.repository', () => ({
  default: { findUser: vi.fn(), findAuthSessionById: vi.fn() },
}))
vi.mock('../src/modules/schools/schools.repository', () => ({
  SchoolsRepo: { listSchoolsForSponsorCheck: vi.fn(), setSponsorCheck: vi.fn() },
}))
vi.mock('../src/modules/team/team.repository', () => ({
  default: { findActiveAdminIds: vi.fn() },
}))
vi.mock('../src/modules/notifications/notifications.service', () => ({
  NotificationsService: { notify: vi.fn() },
}))

// Real rows from the Home Office register (9 Oct 2026), including a quoted name with a comma.
const REGISTER_CSV = [
  'Sponsor Name,Town/City,Additional Locations,Sponsor Type,Status,Route,Immigration Compliance',
  'Abbey College Manchester,Manchester, ,Independent school,Student Sponsor,Child Student, ',
  'Abbey College Manchester,Manchester, ,Independent school,Student Sponsor,Student, ',
  'Coventry University,Coventry, ,Higher Education Institution (HEI),Student Sponsor - Track Record,Student, ',
  'Leeds Beckett University,Leeds, ,Higher Education Institution (HEI),Student Sponsor - Track Record,Student, ',
  'Teesside High School,Stockton on Tees, ,Independent school,Probationary Sponsor,Child Student, ',
  'University of Hertfordshire Higher Education Corporation,Hatfield,Hertfordshire International College (Embedded College),Higher Education Institution (HEI),Student Sponsor - Track Record,Student, ',
  'Academy of Live Technology Ltd,South Kirkby, ,Private provider,Probationary Sponsor,Student,Subject To Action Plan',
  '"Birkbeck College, University of London",London, ,Higher Education Institution (HEI),Student Sponsor - Track Record,Student, ',
].join('\r\n')

const rows = parseRegisterCsv(`﻿${REGISTER_CSV}`)
const index = buildRegisterIndex(rows)

describe('parseRegisterCsv', () => {
  it('reads every row, including quoted names with commas', () => {
    expect(rows).toHaveLength(8)
    expect(rows.at(-1)?.sponsorName).toBe('Birkbeck College, University of London')
    expect(rows[5]?.additionalLocations).toBe('Hertfordshire International College (Embedded College)')
  })

  it('refuses a file without the expected columns', () => {
    expect(() => parseRegisterCsv('Name,City\nX,Y')).toThrow(/Sponsor Name/)
  })
})

describe('findRegisterCsvUrl', () => {
  it('picks the Student register CSV from the GOV.UK content API response', () => {
    const page = {
      details: {
        attachments: [
          { url: 'https://assets.publishing.service.gov.uk/media/abc/guidance.csv' },
          {
            url: 'https://assets.publishing.service.gov.uk/media/6ac8/SP_-_Student_and_Child_Student_Web_Register_-_2026-10-09.csv',
          },
        ],
      },
    }
    expect(findRegisterCsvUrl(page)).toMatch(/Student_and_Child_Student/)
  })

  it('fails loudly when there is no CSV', () => {
    expect(() => findRegisterCsvUrl({ details: {} })).toThrow()
  })
})

describe('matching', () => {
  it('strips legal words so everyday names match the register', () => {
    expect(normalizeSponsorName('The University of Hertfordshire')).toBe(
      normalizeSponsorName('University of Hertfordshire Higher Education Corporation'),
    )
  })

  it('matches by name and ignores the Child Student route', () => {
    const match = matchSchool({ name: 'Abbey College Manchester', city: 'Manchester' }, index)
    expect(match).toMatchObject({ kind: 'matched', row: { route: 'Student' } })
  })

  it('does not match a sponsor that only has the Child Student route', () => {
    expect(matchSchool({ name: 'Teesside High School', city: 'Stockton on Tees' }, index)).toEqual({
      kind: 'unmatched',
      reason: 'no-match',
    })
  })

  it('never guesses when several register names fit', () => {
    const shared = buildRegisterIndex(
      parseRegisterCsv(
        [
          'Sponsor Name,Town/City,Additional Locations,Sponsor Type,Status,Route,Immigration Compliance',
          'London School of Business,London, ,Private provider,Student Sponsor,Student, ',
          'London School of Economics,London, ,HEI,Student Sponsor,Student, ',
        ].join('\n'),
      ),
    )
    expect(matchSchool({ name: 'London School', city: 'London' }, shared)).toEqual({
      kind: 'unmatched',
      reason: 'ambiguous',
    })
  })

  it('recognises UK country spellings', () => {
    expect(isUkCountry(' United Kingdom ')).toBe(true)
    expect(isUkCountry('England')).toBe(true)
    expect(isUkCountry('Canada')).toBe(false)
  })
})

describe('decideSponsorStatus', () => {
  const unknown = { visa_sponsor_status: 'UNKNOWN' as const, visa_sponsor_register_name: null, visa_sponsor_note: null }

  it('marks a matched school LICENSED with its register name and standing', () => {
    const decision = decideSponsorStatus(unknown, matchSchool({ name: 'Academy of Live Technology', city: 'South Kirkby' }, index))
    expect(decision).toEqual({
      status: 'LICENSED',
      registerName: 'Academy of Live Technology Ltd',
      note: 'Probationary Sponsor · Subject To Action Plan',
    })
  })

  it('marks a previously licensed school that dropped off NOT_LISTED', () => {
    const decision = decideSponsorStatus(
      { visa_sponsor_status: 'LICENSED', visa_sponsor_register_name: 'Old Name Ltd', visa_sponsor_note: 'Student Sponsor' },
      { kind: 'unmatched', reason: 'no-match' },
    )
    expect(decision).toMatchObject({ status: 'NOT_LISTED', registerName: 'Old Name Ltd' })
  })

  it('leaves a never-matched school UNKNOWN rather than calling it unlicensed', () => {
    expect(decideSponsorStatus(unknown, { kind: 'unmatched', reason: 'no-match' }).status).toBe('UNKNOWN')
  })
})

describe('SponsorRegisterService.SyncUk', () => {
  const schoolsRepoMock = vi.mocked(SchoolsRepo)
  const auditRepoMock = vi.mocked(AuditRepo)
  const notifyMock = vi.mocked(NotificationsService.notify)

  const school = (overrides: Record<string, unknown>) => ({
    id: 'uuid',
    public_id: 'SCH-0000',
    name: 'x',
    city: 'x',
    country: 'United Kingdom',
    visa_sponsor_status: 'UNKNOWN' as 'UNKNOWN' | 'LICENSED' | 'NOT_LISTED',
    visa_sponsor_register_name: null as string | null,
    visa_sponsor_note: null as string | null,
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(TeamRepo.findActiveAdminIds).mockResolvedValue(['admin-1'])
  })

  it('updates UK schools only, audits changes and alerts admins about a school that dropped off', async () => {
    schoolsRepoMock.listSchoolsForSponsorCheck.mockResolvedValue([
      school({ id: 'herts', public_id: 'SCH-7271', name: 'University of Hertfordshire', city: 'Hatfield' }),
      school({
        id: 'gone',
        public_id: 'SCH-1000',
        name: 'Closed College',
        city: 'Leeds',
        visa_sponsor_status: 'LICENSED',
        visa_sponsor_register_name: 'Closed College Ltd',
        visa_sponsor_note: 'Student Sponsor',
      }),
      school({ id: 'typo', public_id: 'SCH-2000', name: 'Univ of Somewhere', city: 'Bath' }),
      school({ id: 'toronto', public_id: 'SCH-3000', name: 'University of Toronto', city: 'Toronto', country: 'Canada' }),
    ] as never)

    const summary = await SponsorRegisterService.SyncUk({ csvUrl: 'https://example/register.csv', rows })

    expect(summary).toMatchObject({ ukSchools: 3, licensed: 1, notListed: 1, changed: 3 })
    expect(summary.unmatched.map((entry) => entry.publicId)).toEqual(['SCH-2000'])
    expect(schoolsRepoMock.setSponsorCheck).toHaveBeenCalledTimes(3)
    expect(schoolsRepoMock.setSponsorCheck).toHaveBeenCalledWith(
      'herts',
      expect.objectContaining({
        status: 'LICENSED',
        registerName: 'University of Hertfordshire Higher Education Corporation',
      }),
      expect.anything(),
    )
    expect(auditRepoMock.record).toHaveBeenCalledTimes(3)
    expect(notifyMock).toHaveBeenCalledTimes(1)
    expect(notifyMock).toHaveBeenCalledWith(
      ['admin-1'],
      expect.objectContaining({ title: 'Closed College is no longer on the UK sponsor register', link: '/schools/SCH-1000' }),
    )
  })

  it('does not audit or alert when nothing changed', async () => {
    schoolsRepoMock.listSchoolsForSponsorCheck.mockResolvedValue([
      school({
        id: 'cov',
        name: 'Coventry University',
        city: 'Coventry',
        visa_sponsor_status: 'LICENSED',
        visa_sponsor_register_name: 'Coventry University',
        visa_sponsor_note: 'Student Sponsor - Track Record',
      }),
    ] as never)

    const summary = await SponsorRegisterService.SyncUk({ csvUrl: 'x', rows })

    expect(summary.changed).toBe(0)
    expect(schoolsRepoMock.setSponsorCheck).toHaveBeenCalledTimes(1)
    expect(auditRepoMock.record).not.toHaveBeenCalled()
    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('refuses to sync from an empty register instead of un-listing every school', async () => {
    await expect(SponsorRegisterService.SyncUk({ csvUrl: 'x', rows: [] })).rejects.toThrow(/refusing/)
    expect(schoolsRepoMock.setSponsorCheck).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/schools/sponsor-register/sync', () => {
  it('forbids advisors', async () => {
    vi.mocked(AuthRepo.findUser).mockResolvedValue({
      id: 'u1',
      public_id: 'USR-0001',
      full_name: 'Ada Advisor',
      email: 'ada@example.com',
      phone: null,
      password_hash: 'x',
      role: 'ADVISOR',
      status: 'ACTIVE',
      token_version: 0,
      last_login_at: null,
      password_changed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as never)
    vi.mocked(AuthRepo.findAuthSessionById).mockResolvedValue({
      id: 's1',
      user_id: 'u1',
      refresh_token_hash: 'h',
      token_family: 'f',
      user_agent: null,
      ip_address: null,
      expires_at: new Date(Date.now() + 3_600_000),
      revoked_at: null,
      last_used_at: null,
      created_at: new Date(),
    } as never)

    const res = await request(app)
      .post('/api/v1/schools/sponsor-register/sync')
      .set('Authorization', `Bearer ${generateAcessToken('u1', 's1', 'ADVISOR', 0)}`)

    expect(res.status).toBe(403)
    expect(vi.mocked(SchoolsRepo.listSchoolsForSponsorCheck)).not.toHaveBeenCalled()
  })
})
