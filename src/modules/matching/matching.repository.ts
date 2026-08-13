import prisma from '../../database/prisma.js'
import type { StudyLevel } from '../../generated/prisma/index.js'

export class MatchingRepo {
  static findMatchingPrograms = async (filters: {
    studyLevel: StudyLevel | undefined
    countries: string[] | undefined
    limit: number
  }) => {
    return prisma.programs.findMany({
      where: {
        ...(filters.studyLevel !== undefined && { study_level: filters.studyLevel }),
        ...(filters.countries !== undefined && {
          school: { country: { in: filters.countries } },
        }),
      },
      include: {
        school: { select: { public_id: true, name: true, country: true, city: true } },
      },
      orderBy: { tuition_amount: 'asc' },
      take: filters.limit,
    })
  }
}
