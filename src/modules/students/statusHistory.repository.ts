import prisma from '../../database/prisma.js'
import type {
  Prisma,
  StudentStatus,
  StudentStatusChangeSource,
} from '../../generated/prisma/index.js'

export class StudentStatusHistoryRepo {
  /**
   * Moves a student to `to` and appends a history row, inside the caller's
   * transaction. No-op (returns false) when the status wouldn't change, or when
   * `allowedFrom` is given and the current status isn't in it — automatic moves
   * use that to never regress a student who is already further along.
   *
   * The update is guarded on the status just read, so two concurrent changes
   * can't both write a history row with the same stale from_status.
   */
  static transition = async (
    tx: Prisma.TransactionClient,
    params: {
      studentId: string
      to: StudentStatus
      source: StudentStatusChangeSource
      changedBy: string | null
      allowedFrom?: StudentStatus[]
    },
  ): Promise<boolean> => {
    const current = await tx.student.findUnique({
      where: { id: params.studentId },
      select: { status: true },
    })
    if (!current || current.status === params.to) return false
    if (params.allowedFrom && !params.allowedFrom.includes(current.status)) {
      return false
    }

    const { count } = await tx.student.updateMany({
      where: { id: params.studentId, status: current.status },
      data: { status: params.to },
    })
    if (count === 0) return false

    await tx.studentStatusHistory.create({
      data: {
        student_id: params.studentId,
        from_status: current.status,
        to_status: params.to,
        source: params.source,
        changed_by: params.changedBy,
      },
    })
    return true
  }

  static listForStudent = async (studentId: string) => {
    return prisma.studentStatusHistory.findMany({
      where: { student_id: studentId },
      include: { changer: { select: { public_id: true, full_name: true } } },
      orderBy: { created_at: 'desc' },
    })
  }
}
