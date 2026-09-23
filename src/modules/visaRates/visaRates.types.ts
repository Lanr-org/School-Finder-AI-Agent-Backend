export interface CreateVisaRateDTO {
  country: string
  sourcePartner?: string | undefined
  periodLabel: string
  successRate: number
  sampleSize?: number | undefined
  publishedAt: Date
}

export interface UpdateVisaRateDTO {
  country?: string | undefined
  sourcePartner?: string | null | undefined
  periodLabel?: string | undefined
  successRate?: number | undefined
  sampleSize?: number | null | undefined
  publishedAt?: Date | undefined
  isActive?: boolean | undefined
}

export interface ListVisaRatesQueryDTO {
  country?: string | undefined
  page: number
  limit: number
}

export interface ListVisaRatesFilters {
  country?: string | undefined
  page: number
  limit: number
}
