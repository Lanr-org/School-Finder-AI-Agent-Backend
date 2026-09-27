import prisma from '../../database/prisma'

// Same selection as MatchingRepo.findMatchingPrograms, so the scorer accepts it.
const programForScoring = {
  school: {
    select: { public_id: true, name: true, country: true, city: true, visa_friendliness_score: true },
  },
  intakes: true,
} as const

const StudentPortalRepo = {
  // Superset of StudentsRepo.findStudentById (contact + latest conversation), which is what the scorer takes.
  findStudent: (studentId: string) =>
    prisma.student.findUnique({
      where: { id: studentId },
      include: {
        contact: true,
        identities: true,
        conversations: { take: 1, orderBy: { created_at: 'desc' } },
      },
    }),

  countShortlist: (studentId: string) => prisma.studentShortlist.count({ where: { student_id: studentId } }),

  listApplicationStatuses: async (studentId: string) =>
    (
      await prisma.studentApplication.findMany({
        where: { student_id: studentId },
        select: { status: true },
      })
    ).map((application) => application.status),

  findProgramForScoring: (publicId: string, { activeOnly }: { activeOnly: boolean }) =>
    prisma.programs.findFirst({
      where: { public_id: publicId, ...(activeOnly && { school: { record_status: 'ACTIVE' } }) },
      include: programForScoring,
    }),

  findProgramById: (programId: string) =>
    prisma.programs.findUnique({ where: { id: programId }, include: programForScoring }),

  // Choosing also shortlists, in one transaction.
  choose: (studentId: string, programId: string) =>
    prisma.$transaction([
      prisma.studentShortlist.upsert({
        where: { student_id_program_id: { student_id: studentId, program_id: programId } },
        create: { student_id: studentId, program_id: programId },
        update: {},
      }),
      prisma.student.update({ where: { id: studentId }, data: { chosen_program_id: programId } }),
    ]),

  // Removing the chosen programme from the shortlist also clears the choice.
  removeFromShortlist: (studentId: string, programId: string) =>
    prisma.$transaction([
      prisma.studentShortlist.deleteMany({ where: { student_id: studentId, program_id: programId } }),
      prisma.student.updateMany({
        where: { id: studentId, chosen_program_id: programId },
        data: { chosen_program_id: null },
      }),
    ]),

  // Only the first share is recorded.
  markStudyPlanShared: (studentId: string) =>
    prisma.student.updateMany({
      where: { id: studentId, study_plan_shared_at: null },
      data: { study_plan_shared_at: new Date() },
    }),
}

export default StudentPortalRepo
