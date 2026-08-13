import type { PartnerStatus, SchoolRecordStatus, SchoolType } from '../../generated/prisma/index.js'

export interface CreateSchoolDTO {
  name: string
  schoolType: SchoolType
  recordStatus?: SchoolRecordStatus
  description?: string | null
  website?: string | null
  admissionsEmail?: string | null
  phoneNumbers?: string[]
  streetAddress?: string | null
  city: string
  country: string
  postalCode?: string | null
  partnerStatus?: PartnerStatus
  visaFriendlinessScore?: number | null
  visaFriendlinessNotes?: string | null
  admissionFriendlinessScore?: number | null
  admissionFriendlinessNotes?: string | null
  rankingReputationNotes?: string | null
}

export interface UpdateSchoolDTO {
  name?: string
  schoolType?: SchoolType
  recordStatus?: SchoolRecordStatus
  description?: string | null
  website?: string | null
  admissionsEmail?: string | null
  phoneNumbers?: string[]
  streetAddress?: string | null
  city?: string
  country?: string
  postalCode?: string | null
  partnerStatus?: PartnerStatus
  visaFriendlinessScore?: number | null
  visaFriendlinessNotes?: string | null
  admissionFriendlinessScore?: number | null
  admissionFriendlinessNotes?: string | null
  rankingReputationNotes?: string | null
}

export interface ListSchoolsQueryDTO {
  country?: string
  city?: string
  schoolType?: SchoolType
  partnerStatus?: PartnerStatus
  recordStatus?: SchoolRecordStatus
  search?: string
  page: number
  limit: number
}
