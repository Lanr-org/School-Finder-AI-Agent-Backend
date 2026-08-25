export interface ProgramMatchIntake {
  month: string
  year: number
  applicationDeadline: Date | null
}

export interface ProgramMatch {
  publicId: string
  name: string
  studyLevel: string
  qualification: string
  category: string
  tuitionAmount: number
  tuitionCurrency: string
  intakes: ProgramMatchIntake[]
  school: {
    publicId: string
    name: string
    country: string
    city: string
  }
}
