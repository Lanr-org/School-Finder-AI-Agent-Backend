import prisma from '../../database/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import type { ListBulletinsFilters } from './bulletins.types.js'

export class BulletinsRepo {
  static create = async (data: {
    publicId: string
    title: string
    body: string
    sourcePartner: string | null
    countries: string[]
    publishedAt: Date
    expiresAt: Date | null
    createdBy: string
  }) => {
    return prisma.industryBulletin.create({
      data: {
        public_id: data.publicId,
        title: data.title,
        body: data.body,
        source_partner: data.sourcePartner,
        countries: data.countries,
        published_at: data.publishedAt,
        expires_at: data.expiresAt,
        created_by: data.createdBy,
      },
    })
  }

  static findByPublicId = async (publicId: string) => {
    return prisma.industryBulletin.findUnique({
      where: { public_id: publicId },
    })
  }

  static list = async (filters: ListBulletinsFilters) => {
    const where: Prisma.IndustryBulletinWhereInput = {
      ...(filters.country !== undefined && {
        countries: { has: filters.country },
      }),
    }

    const [bulletins, total] = await prisma.$transaction([
      prisma.industryBulletin.findMany({
        where,
        orderBy: { published_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.industryBulletin.count({ where }),
    ])

    return { bulletins, total }
  }

  static update = async (
    id: string,
    data: {
      title?: string | undefined
      body?: string | undefined
      sourcePartner?: string | null | undefined
      countries?: string[] | undefined
      publishedAt?: Date | undefined
      expiresAt?: Date | null | undefined
      isActive?: boolean | undefined
    },
  ) => {
    return prisma.industryBulletin.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.body !== undefined && { body: data.body }),
        ...(data.sourcePartner !== undefined && {
          source_partner: data.sourcePartner,
        }),
        ...(data.countries !== undefined && { countries: data.countries }),
        ...(data.publishedAt !== undefined && {
          published_at: data.publishedAt,
        }),
        ...(data.expiresAt !== undefined && { expires_at: data.expiresAt }),
        ...(data.isActive !== undefined && { is_active: data.isActive }),
      },
    })
  }

  static delete = async (id: string) => {
    return prisma.industryBulletin.delete({ where: { id } })
  }

  // AI grounding-context pipeline: active, unexpired bulletins matching one of
  // the given (already normalized) countries, or global bulletins (empty
  // countries array) when no countries are given.
  static findActiveForCountries = async (countries: string[]) => {
    const now = new Date()

    return prisma.industryBulletin.findMany({
      where: {
        is_active: true,
        AND: [
          { OR: [{ expires_at: null }, { expires_at: { gt: now } }] },
          countries.length > 0
            ? {
                OR: [
                  { countries: { isEmpty: true } },
                  { countries: { hasSome: countries } },
                ],
              }
            : { countries: { isEmpty: true } },
        ],
      },
      orderBy: { published_at: 'desc' },
      take: 3,
    })
  }
}
