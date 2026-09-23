export interface RecommendationWeightsDTO {
  version: number
  programWeight: number
  budgetWeight: number
  intakeWeight: number
  visaWeight: number
  createdAt: Date | null
}

export interface UpdateWeightsDTO {
  programWeight: number
  budgetWeight: number
  intakeWeight: number
  visaWeight: number
}

export interface GenerateRunDTO {
  limit: number
}

export interface CreateShortlistDTO {
  programId: string
}

export interface ListRecommendationsQueryDTO {
  search: string | undefined
  country: string | undefined
  advisorId: string | undefined
  minScore: number | undefined
  hasMissingRequirements: boolean | undefined
  page: number
  limit: number
}

export interface ScoredFit {
  score: number
  reasons: string[]
  missingRequirements: string[]
}

export interface ProgramFitBreakdown {
  program: ScoredFit
  budget: ScoredFit
  intake: ScoredFit
  visa: ScoredFit
}
