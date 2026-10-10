import prisma from '../../database/prisma.js'

// Students see only programmes a person has checked against the official page, but only once
// the catalogue has enough of them. Until then unverified ones still show, so matching never
// goes empty during the first weeks of data entry. Staff views always see everything.
export const MIN_VERIFIED_FOR_STUDENTS = 30

export class MatchingRepo {
  static studentFacingVerifiedOnly = async (): Promise<boolean> =>
    (await prisma.programs.count({
      where: { verification_status: 'VERIFIED' },
    })) >= MIN_VERIFIED_FOR_STUDENTS

  // Candidate pool for scoring, shared by MatchingService (ephemeral AI-grounding
  // shortlist) and RecommendationsService (persisted recommendation runs). Only
  // hard-filters on active schools and destination country — study level and
  // intake are soft, scored dimensions now, not filters, so near-misses still
  // surface with a lower score and a reason instead of being hidden outright.
  static findMatchingPrograms = async (filters: {
    countries: string[] | undefined
    poolCap: number
    verifiedOnly?: boolean
  }) => {
    return prisma.programs.findMany({
      where: {
        ...(filters.verifiedOnly === true && {
          verification_status: 'VERIFIED',
        }),
        school: {
          record_status: 'ACTIVE',
          ...(filters.countries !== undefined && {
            country: { in: filters.countries, mode: 'insensitive' },
          }),
        },
      },
      include: {
        school: {
          select: {
            public_id: true,
            name: true,
            country: true,
            city: true,
            visa_friendliness_score: true,
          },
        },
        intakes: true,
      },
      orderBy: { tuition_amount: 'asc' },
      take: filters.poolCap,
    })
  }
}
