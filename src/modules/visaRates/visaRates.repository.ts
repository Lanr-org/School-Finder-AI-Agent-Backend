import prisma from '../../database/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import type { ListVisaRatesFilters } from './visaRates.types.js'

export class VisaRatesRepo {
  static create = async (data: {
    publicId: string
    country: string
    sourcePartner: string | null
    periodLabel: string
    successRate: number
    sampleSize: number | null
    publishedAt: Date
    createdBy: string
  }) => {
    return prisma.visaSuccessRate.create({
      data: {
        public_id: data.publicId,
        country: data.country,
        source_partner: data.sourcePartner,
        period_label: data.periodLabel,
        success_rate: data.successRate,
        sample_size: data.sampleSize,
        published_at: data.publishedAt,
        created_by: data.createdBy,
      },
    })
  }

  static findByPublicId = async (publicId: string) => {
    return prisma.visaSuccessRate.findUnique({ where: { public_id: publicId } })
  }

  static list = async (filters: ListVisaRatesFilters) => {
    const where: Prisma.VisaSuccessRateWhereInput = {
      ...(filters.country !== undefined && {
        country: { equals: filters.country, mode: 'insensitive' },
      }),
    }

    const [rates, total] = await prisma.$transaction([
      prisma.visaSuccessRate.findMany({
        where,
        orderBy: { published_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.visaSuccessRate.count({ where }),
    ])

    return { rates, total }
  }

  static update = async (
    id: string,
    data: {
      country?: string | undefined
      sourcePartner?: string | null | undefined
      periodLabel?: string | undefined
      successRate?: number | undefined
      sampleSize?: number | null | undefined
      publishedAt?: Date | undefined
      isActive?: boolean | undefined
    },
  ) => {
    return prisma.visaSuccessRate.update({
      where: { id },
      data: {
        ...(data.country !== undefined && { country: data.country }),
        ...(data.sourcePartner !== undefined && {
          source_partner: data.sourcePartner,
        }),
        ...(data.periodLabel !== undefined && {
          period_label: data.periodLabel,
        }),
        ...(data.successRate !== undefined && {
          success_rate: data.successRate,
        }),
        ...(data.sampleSize !== undefined && { sample_size: data.sampleSize }),
        ...(data.publishedAt !== undefined && {
          published_at: data.publishedAt,
        }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
      },
    })
  }

  static delete = async (id: string) => {
    return prisma.visaSuccessRate.delete({ where: { id } })
  }

  // AI grounding-context pipeline: the single latest active rate per country
  // among the given (already normalized) countries.
  static findLatestActiveForCountries = async (countries: string[]) => {
    if (countries.length === 0) return []

    const rows = await prisma.visaSuccessRate.findMany({
      where: {
        is_active: true,
        country: { in: countries, mode: 'insensitive' },
      },
      orderBy: { published_at: 'desc' },
      take: countries.length * 3,
    })

    const seen = new Set<string>()
    const latestPerCountry: typeof rows = []
    for (const row of rows) {
      const key = row.country.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      latestPerCountry.push(row)
    }
    return latestPerCountry
  }
}
