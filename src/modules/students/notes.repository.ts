import prisma from '../../database/prisma.js'

export class NotesRepo {
  static createNote = async (data: {
    publicId: string
    studentId: string
    advisorId: string
    body: string
  }) => {
    return prisma.studentNote.create({
      data: {
        public_id: data.publicId,
        student_id: data.studentId,
        advisor_id: data.advisorId,
        body: data.body,
      },
    })
  }

  static findByPublicId = async (studentId: string, noteId: string) => {
    return prisma.studentNote.findFirst({
      where: { public_id: noteId, student_id: studentId, deleted_at: null },
    })
  }

  static listForStudent = async (
    studentId: string,
    filters: { page: number; limit: number },
  ) => {
    const where = { student_id: studentId, deleted_at: null }

    const [notes, total] = await prisma.$transaction([
      prisma.studentNote.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.studentNote.count({ where }),
    ])

    return { notes, total }
  }

  static updateNote = async (id: string, body: string) => {
    return prisma.studentNote.update({ where: { id }, data: { body } })
  }

  static softDeleteNote = async (id: string) => {
    return prisma.studentNote.update({
      where: { id },
      data: { deleted_at: new Date() },
    })
  }
}
