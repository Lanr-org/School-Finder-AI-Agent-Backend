import prisma from '../../database/prisma'

export const STUDY_PLAN_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days: parents may open it weeks later

const StudyPlanLinkRepo = {
  create: (studentId: string, tokenHash: string) =>
    prisma.studyPlanLink.create({
      data: {
        student_id: studentId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + STUDY_PLAN_LINK_TTL_MS),
      },
    }),

  // The student a live (unexpired, unrevoked) link points to, or null.
  findLiveStudentId: async (tokenHash: string) => {
    const link = await prisma.studyPlanLink.findFirst({
      where: {
        token_hash: tokenHash,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      select: { student_id: true },
    })
    return link?.student_id ?? null
  },

  revokeAll: (studentId: string) =>
    prisma.studyPlanLink.updateMany({
      where: { student_id: studentId, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
}

export default StudyPlanLinkRepo
