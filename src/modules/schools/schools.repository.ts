import prisma from '../../database/prisma.js'
import type { Prisma } from '../../generated/prisma/index.js'
import type { Db } from '../../database/transaction.js'
import type { CreateSchoolDTO, ListSchoolsQueryDTO, UpdateSchoolDTO } from './schools.types.js'

export class SchoolsRepo {
  static createSchool = async (publicId: string, data: CreateSchoolDTO, db: Db = prisma) => {
    return db.schools.create({
      data: {
        public_id: publicId,
        name: data.name,
        school_type: data.schoolType,
        ...(data.recordStatus !== undefined && { record_status: data.recordStatus }),
        description: data.description ?? null,

        website: data.website ?? null,
        admissions_email: data.admissionsEmail ?? null,
        phone_numbers: data.phoneNumbers ?? [],

        street_address: data.streetAddress ?? null,
        city: data.city,
        country: data.country,
        postal_code: data.postalCode ?? null,

        ...(data.partnerStatus !== undefined && { partner_status: data.partnerStatus }),
        visa_friendliness_score: data.visaFriendlinessScore ?? null,
        visa_friendliness_notes: data.visaFriendlinessNotes ?? null,
        admission_friendliness_score: data.admissionFriendlinessScore ?? null,
        admission_friendliness_notes: data.admissionFriendlinessNotes ?? null,
        ranking_reputation_notes: data.rankingReputationNotes ?? null,
      },
    })
  }

  static findSchoolByPublicId = async (publicId: string) => {
    return prisma.schools.findUnique({ where: { public_id: publicId } })
  }

  static listSchools = async (filters: ListSchoolsQueryDTO) => {
    const where: Prisma.SchoolsWhereInput = {
      ...(filters.country !== undefined && { country: filters.country }),
      ...(filters.city !== undefined && { city: filters.city }),
      ...(filters.schoolType !== undefined && { school_type: filters.schoolType }),
      ...(filters.partnerStatus !== undefined && { partner_status: filters.partnerStatus }),
      ...(filters.recordStatus !== undefined && { record_status: filters.recordStatus }),
      ...(filters.search !== undefined && {
        name: { contains: filters.search, mode: 'insensitive' },
      }),
    }

    const [schools, total] = await prisma.$transaction([
      prisma.schools.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.schools.count({ where }),
    ])

    return { schools, total }
  }

  static updateSchool = async (id: string, data: UpdateSchoolDTO, db: Db = prisma) => {
    return db.schools.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.schoolType !== undefined && { school_type: data.schoolType }),
        ...(data.recordStatus !== undefined && { record_status: data.recordStatus }),
        ...(data.description !== undefined && { description: data.description }),

        ...(data.website !== undefined && { website: data.website }),
        ...(data.admissionsEmail !== undefined && { admissions_email: data.admissionsEmail }),
        ...(data.phoneNumbers !== undefined && { phone_numbers: data.phoneNumbers }),

        ...(data.streetAddress !== undefined && { street_address: data.streetAddress }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.postalCode !== undefined && { postal_code: data.postalCode }),

        ...(data.partnerStatus !== undefined && { partner_status: data.partnerStatus }),
        ...(data.visaFriendlinessScore !== undefined && { visa_friendliness_score: data.visaFriendlinessScore }),
        ...(data.visaFriendlinessNotes !== undefined && { visa_friendliness_notes: data.visaFriendlinessNotes }),
        ...(data.admissionFriendlinessScore !== undefined && { admission_friendliness_score: data.admissionFriendlinessScore }),
        ...(data.admissionFriendlinessNotes !== undefined && { admission_friendliness_notes: data.admissionFriendlinessNotes }),
        ...(data.rankingReputationNotes !== undefined && { ranking_reputation_notes: data.rankingReputationNotes }),
      },
    })
  }

  static softDeleteSchool = async (id: string, db: Db = prisma) => {
    return db.schools.update({
      where: { id },
      data: { record_status: 'INACTIVE' },
    })
  }
}
