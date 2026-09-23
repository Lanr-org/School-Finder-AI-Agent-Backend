import type { StudyLevel } from '../../generated/prisma/index.js'

// Shared by matching.service.ts, recommendations.scoring.ts, and every module
// that groups partner data by country (bulletins, visaRates, ai/industry-context) —
// kept in its own file so recommendations.scoring.ts can depend on these pure
// helpers without importing matching.service.ts (which itself depends on the
// scoring module), avoiding a circular import between the two.

const STUDY_LEVEL_KEYWORDS: Record<StudyLevel, string[]> = {
  UNDERGRADUATE: ['undergrad', 'bachelor', 'bsc', 'first degree'],
  POSTGRADUATE: ['postgrad', 'master', 'msc', 'mba'],
  DOCTORATE: ['phd', 'doctorate', 'doctoral'],
  FOUNDATION: ['foundation', 'pre-university', 'access course'],
}

export const normalizeStudyLevel = (
  raw: string | null,
): StudyLevel | undefined => {
  if (!raw) return undefined
  const lower = raw.toLowerCase()
  const match = (
    Object.entries(STUDY_LEVEL_KEYWORDS) as [StudyLevel, string[]][]
  ).find(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
  return match?.[0]
}

// Maps abbreviations used by the Telegram destination buttons (e.g. "UK") to the full country
// names stored on Schools.country. Anything not listed here passes through as-is and is matched
// case-insensitively by the repo query, which covers plain casing differences on its own.
const COUNTRY_ALIASES: Record<string, string> = {
  UK: 'United Kingdom',
  USA: 'United States',
  US: 'United States',
}

export const normalizeCountry = (raw: string): string =>
  COUNTRY_ALIASES[raw.toUpperCase()] ?? raw
