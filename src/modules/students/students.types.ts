import { StudentStatus } from '../../generated/prisma/index.js'

export interface UpdateStudentPreferencesDTO {
  studyLevel?: string | undefined
  targetDestinations?: string[] | undefined
  targetIntake?: string | undefined
  budgetRange?: string | undefined
  academicBackground?: string | undefined
  englishTestScore?: string | undefined
}

export interface UpdateStudentStatusDTO {
  status: StudentStatus
  note?: string | undefined
}

export interface AssignAdvisorToStudentDTO {
  advisorId: string
}
