import prisma from '../../database/prisma.js'
import type { Db, Tx } from '../../database/transaction.js'
import { ConversationStatus, type StudentIdentityProvider } from '../../generated/prisma/index.js'
import { fillBlanks, mergeSideInclude, type MergeSide } from './studentLink.rules.js'

const LINK_TTL_MS = 15 * 60_000

const StudentLinkRepo = {
  createToken: (studentId: string, tokenHash: string, redeemWith: StudentIdentityProvider) =>
    prisma.studentLinkToken.create({
      data: {
        student_id: studentId,
        token_hash: tokenHash,
        redeem_with: redeemWith,
        expires_at: new Date(Date.now() + LINK_TTL_MS),
      },
    }),

  // Single use: only one caller can flip consumed_at, so a token can't be redeemed twice.
  redeemToken: async (tokenHash: string, redeemWith: StudentIdentityProvider) => {
    const token = await prisma.studentLinkToken.findUnique({ where: { token_hash: tokenHash } })
    if (!token || token.redeem_with !== redeemWith) return null
    const now = new Date()
    const { count } = await prisma.studentLinkToken.updateMany({
      where: { id: token.id, consumed_at: null, expires_at: { gt: now } },
      data: { consumed_at: now },
    })
    return count === 1 ? token.student_id : null
  },

  findIdentity: (provider: StudentIdentityProvider, subject: string) =>
    prisma.studentIdentity.findUnique({ where: { provider_subject: { provider, subject } } }),

  findStudentIdentity: (studentId: string, provider: StudentIdentityProvider) =>
    prisma.studentIdentity.findUnique({ where: { student_id_provider: { student_id: studentId, provider } } }),

  addIdentity: (
    studentId: string,
    provider: StudentIdentityProvider,
    subject: string,
    email: string | null,
    tx: Db = prisma,
  ) =>
    tx.studentIdentity.create({
      data: { student_id: studentId, provider, subject, email },
      include: { student: { select: { public_id: true } } },
    }),

  // What the merge rules need about each side.
  loadForMerge: (studentId: string): Promise<MergeSide> =>
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: mergeSideInclude }),

  // Moves everything the absorbed student has onto the survivor, then deletes it.
  absorb: async (survivor: MergeSide, absorbed: MergeSide, tx: Tx) => {
    const open = { in: [ConversationStatus.ACTIVE, ConversationStatus.ESCALATED] }
    // One current thread: if the survivor already has an open one, the absorbed one closes.
    if ((await tx.conversations.count({ where: { student_id: survivor.id, status: open } })) > 0) {
      await tx.conversations.updateMany({
        where: { student_id: absorbed.id, status: open },
        data: { status: ConversationStatus.RESOLVED },
      })
    }
    await tx.conversations.updateMany({ where: { student_id: absorbed.id }, data: { student_id: survivor.id } })

    const kept = await tx.studentShortlist.findMany({
      where: { student_id: survivor.id },
      select: { program_id: true },
    })
    await tx.studentShortlist.deleteMany({
      where: { student_id: absorbed.id, program_id: { in: kept.map((k) => k.program_id) } },
    })
    await tx.studentShortlist.updateMany({ where: { student_id: absorbed.id }, data: { student_id: survivor.id } })

    // Journey ticks: same as the shortlist, the survivor's own tick wins on a clash.
    const keptChecks = await tx.studentJourneyCheck.findMany({
      where: { student_id: survivor.id },
      select: { key: true },
    })
    await tx.studentJourneyCheck.deleteMany({
      where: { student_id: absorbed.id, key: { in: keptChecks.map((c) => c.key) } },
    })
    await tx.studentJourneyCheck.updateMany({ where: { student_id: absorbed.id }, data: { student_id: survivor.id } })
    // Links already sent to parents keep working, now showing the survivor's plan.
    await tx.studyPlanLink.updateMany({ where: { student_id: absorbed.id }, data: { student_id: survivor.id } })

    await tx.studentIdentity.updateMany({ where: { student_id: absorbed.id }, data: { student_id: survivor.id } })
    // Moved, not revoked: a signed-in web tab picks up the survivor on its next refresh.
    await tx.studentSession.updateMany({ where: { student_id: absorbed.id }, data: { student_id: survivor.id } })

    await tx.student.update({ where: { id: survivor.id }, data: fillBlanks(survivor, absorbed) })
    if (!survivor.contact.email && absorbed.contact.email) {
      await tx.contacts.update({ where: { id: survivor.contact_id }, data: { email: absorbed.contact.email } })
    }
    // Deleting the contact cascades to the absorbed student (and its lead status history).
    await tx.contacts.delete({ where: { id: absorbed.contact_id } })
  },
}

export default StudentLinkRepo
