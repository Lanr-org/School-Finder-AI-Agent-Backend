import prisma from '../../database/prisma.js'
import type { IntakeMonth, StudyLevel } from '../../generated/prisma/index.js'

export class MatchingRepo {
  static findMatchingPrograms = async (filters: {
    studyLevel: StudyLevel | undefined
    countries: string[] | undefined
    intakeMonth: IntakeMonth | undefined
    intakeYear: number | undefined
    limit: number
  }) => {
    return prisma.programs.findMany({
      where: {
        ...(filters.studyLevel !== undefined && { study_level: filters.studyLevel }),
        ...(filters.countries !== undefined && {
          school: { country: { in: filters.countries, mode: 'insensitive' } },
        }),
        ...(filters.intakeMonth !== undefined &&
          filters.intakeYear !== undefined && {
            intakes: { some: { month: filters.intakeMonth, year: filters.intakeYear } },
          }),
      },
      include: {
        school: { select: { public_id: true, name: true, country: true, city: true } },
        intakes: true,
      },
      orderBy: { tuition_amount: 'asc' },
      take: filters.limit,
    })
  }
}
