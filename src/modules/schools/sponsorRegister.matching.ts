import type { SponsorRegisterRow } from '../../integrations/govuk/sponsorRegister.js'

// Countries we check against the UK register (schools store free-text country names).
const UK_COUNTRY_NAMES = new Set([
  'united kingdom',
  'uk',
  'great britain',
  'england',
  'scotland',
  'wales',
  'northern ireland',
])

export const isUkCountry = (country: string) => UK_COUNTRY_NAMES.has(country.trim().toLowerCase())

// The register uses legal names ("University of Hertfordshire Higher Education Corporation",
// "Coventry University Limited"); agents type the everyday name. Strip the legal words.
const LEGAL_WORDS = /\b(the|higher education corporation|corporation|limited|ltd|plc|incorporated|trust)\b/g

export const normalizeSponsorName = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(LEGAL_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export type RegisterIndex = Map<string, SponsorRegisterRow[]>

// Only the adult Student route matters to us; "Child Student" is for under-18 schools.
export const buildRegisterIndex = (rows: SponsorRegisterRow[]): RegisterIndex => {
  const index: RegisterIndex = new Map()
  for (const row of rows) {
    if (row.route !== 'Student') continue
    const key = normalizeSponsorName(row.sponsorName)
    if (key === '') continue
    index.set(key, [...(index.get(key) ?? []), row])
  }
  return index
}

export type SponsorMatch =
  | { kind: 'matched'; row: SponsorRegisterRow }
  | { kind: 'unmatched'; reason: 'no-match' | 'ambiguous' }

const pickByTown = (rows: SponsorRegisterRow[], city: string): SponsorMatch => {
  if (rows.length === 1) return { kind: 'matched', row: rows[0]! }
  const town = city.trim().toLowerCase()
  const inTown = rows.filter((row) => row.town.toLowerCase() === town)
  return inTown.length === 1 ? { kind: 'matched', row: inTown[0]! } : { kind: 'unmatched', reason: 'ambiguous' }
}

// Exact normalised name first. Otherwise a single register name that extends ours, or that ours
// extends ("University of X" vs "University of X London"). Two or more candidates: never guess.
export const matchSchool = (school: { name: string; city: string }, index: RegisterIndex): SponsorMatch => {
  const name = normalizeSponsorName(school.name)
  if (name === '') return { kind: 'unmatched', reason: 'no-match' }

  const exact = index.get(name)
  if (exact) return pickByTown(exact, school.city)

  const candidates = [...index.keys()].filter((key) => key.startsWith(`${name} `) || name.startsWith(`${key} `))
  if (candidates.length === 1) return pickByTown(index.get(candidates[0]!)!, school.city)
  return { kind: 'unmatched', reason: candidates.length > 1 ? 'ambiguous' : 'no-match' }
}

// What agents should know about the sponsor's standing, e.g. "Probationary Sponsor · Subject To Action Plan".
export const sponsorNote = (row: SponsorRegisterRow) =>
  [row.status, row.immigrationCompliance].filter((part) => part !== '').join(' · ').slice(0, 200)

// Probationary sponsors and those on an action plan are worth a second look before advising.
export const isCautionNote = (note: string | null) =>
  note !== null && /probationary|action plan/i.test(note)
