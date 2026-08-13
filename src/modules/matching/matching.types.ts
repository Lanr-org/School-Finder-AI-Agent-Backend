export interface ProgramMatch {
  publicId: string
  name: string
  studyLevel: string
  qualification: string
  category: string
  tuitionAmount: number
  tuitionCurrency: string
  school: {
    publicId: string
    name: string
    country: string
    city: string
  }
}
