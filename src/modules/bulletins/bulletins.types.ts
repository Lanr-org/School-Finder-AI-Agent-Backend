export interface CreateBulletinDTO {
  title: string
  body: string
  sourcePartner?: string | undefined
  countries?: string[] | undefined
  publishedAt: Date
  expiresAt?: Date | undefined
}

export interface UpdateBulletinDTO {
  title?: string | undefined
  body?: string | undefined
  sourcePartner?: string | null | undefined
  countries?: string[] | undefined
  publishedAt?: Date | undefined
  expiresAt?: Date | null | undefined
  isActive?: boolean | undefined
}

export interface ListBulletinsQueryDTO {
  country?: string | undefined
  page: number
  limit: number
}

export interface ListBulletinsFilters {
  country?: string | undefined
  page: number
  limit: number
}
