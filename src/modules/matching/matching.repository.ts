import prisma from '../../database/prisma.js'

export class MatchingRepo {
  // Candidate pool for scoring, shared by MatchingService (ephemeral AI-grounding
  // shortlist) and RecommendationsService (persisted recommendation runs). Only
  // hard-filters on active schools and destination country — study level and
  // intake are soft, scored dimensions now, not filters, so near-misses still
  // surface with a lower score and a reason instead of being hidden outright.
  static findMatchingPrograms = async (filters: {
    countries: string[] | undefined
    poolCap: number
  }) => {
    return prisma.programs.findMany({
      where: {
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
