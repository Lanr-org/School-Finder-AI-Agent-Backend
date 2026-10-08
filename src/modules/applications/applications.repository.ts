import prisma from '../../database/prisma.js'
import {
  StudentStatus,
  type ApplicationStatus,
  type IntakeMonth,
  type Prisma,
} from '../../generated/prisma/index.js'
import { StudentStatusHistoryRepo } from '../students/statusHistory.repository.js'
import { withTx, type Db, type Tx } from '../../database/transaction.js'
import { TERMINAL_STATUSES } from './applications.transitions.js'
import type {
  ListApplicationsFilters,
  ListStudentApplicationsQueryDTO,
  UpdateApplicationDTO,
} from './applications.types.js'

const withRelations = {
  include: {
    student: {
      select: {
        public_id: true,
        assigned_advisor_id: true,
        contact: { select: { first_name: true, last_name: true } },
      },
    },
    program: {
      select: {
        public_id: true,
        name: true,
        study_level: true,
        school: { select: { public_id: true, name: true, country: true } },
        // Needed to resolve the chosen intake's stored deadline.
        intakes: true,
      },
    },
    creator: { select: { public_id: true, full_name: true } },
  },
} as const

export type ApplicationWithRelations = Prisma.StudentApplicationGetPayload<
  typeof withRelations
>

export class ApplicationsRepo {
  static findByPublicId = async (publicId: string) => {
    return prisma.studentApplication.findUnique({
      where: { public_id: publicId },
      ...withRelations,
    })
  }

  static findHistory = async (applicationId: string) => {
    return prisma.applicationStatusHistory.findMany({
      where: { application_id: applicationId },
      include: { changer: { select: { public_id: true, full_name: true } } },
      orderBy: { created_at: 'asc' },
    })
  }

  static findOpenForStudentProgram = async (
    studentId: string,
    programId: string,
  ) => {
    return prisma.studentApplication.findFirst({
      where: {
        student_id: studentId,
        program_id: programId,
        status: { notIn: TERMINAL_STATUSES },
      },
    })
  }

  static findProgramIntake = async (
    programId: string,
    month: IntakeMonth,
    year: number,
  ) => {
    return prisma.programIntakes.findUnique({
      where: {
        program_id_month_year: { program_id: programId, month, year },
      },
    })
  }

  static listForStudent = async (
    studentId: string,
    filters: ListStudentApplicationsQueryDTO,
  ) => {
    const where: Prisma.StudentApplicationWhereInput = {
      student_id: studentId,
      ...(filters.status !== undefined && { status: filters.status }),
    }

    const [applications, total] = await prisma.$transaction([
      prisma.studentApplication.findMany({
        where,
        ...withRelations,
        orderBy: { created_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.studentApplication.count({ where }),
    ])

    return { applications, total }
  }

  /**
   * Cross-student list. `summary` counts every status within the same
   * advisor/search scope but ignores the status filter, so stat cards stay
   * stable while the table is filtered.
   */
  static list = async (filters: ListApplicationsFilters) => {
    const scope: Prisma.StudentApplicationWhereInput = {
      ...(filters.advisorUserId !== undefined && {
        student: { assigned_advisor_id: filters.advisorUserId },
      }),
      ...(filters.search !== undefined && {
        OR: [
          { public_id: { contains: filters.search, mode: 'insensitive' } },
          {
            student: {
              public_id: { contains: filters.search, mode: 'insensitive' },
            },
          },
          {
            student: {
              contact: {
                first_name: { contains: filters.search, mode: 'insensitive' },
              },
            },
          },
          {
            student: {
              contact: {
                last_name: { contains: filters.search, mode: 'insensitive' },
              },
            },
          },
          {
            program: {
              name: { contains: filters.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    }
    const where: Prisma.StudentApplicationWhereInput = {
      ...scope,
      ...(filters.status !== undefined && { status: filters.status }),
    }

    const [applications, total, grouped] = await prisma.$transaction([
      prisma.studentApplication.findMany({
        where,
        ...withRelations,
        orderBy: { updated_at: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.studentApplication.count({ where }),
      prisma.studentApplication.groupBy({
        by: ['status'],
        where: scope,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
    ])

    const summary = new Map<ApplicationStatus, number>(
      grouped.map((row) => [
        row.status,
        typeof row._count === 'object' ? (row._count._all ?? 0) : 0,
      ]),
    )

    return { applications, total, summary }
  }

  /** Application + initial DRAFT history row + student auto-advance, atomically. */
  static createWithHistory = async (
    data: {
      publicId: string
      studentId: string
      programId: string
      createdBy: string
      intakeMonth?: IntakeMonth | undefined
      intakeYear?: number | undefined
      externalReference?: string | undefined
      notes?: string | undefined
    },
    outerTx?: Tx,
  ) => {
    return withTx(outerTx, async (tx) => {
      const application = await tx.studentApplication.create({
        data: {
          public_id: data.publicId,
          student_id: data.studentId,
          program_id: data.programId,
          created_by: data.createdBy,
          ...(data.intakeMonth !== undefined && {
            intake_month: data.intakeMonth,
          }),
          ...(data.intakeYear !== undefined && {
            intake_year: data.intakeYear,
          }),
          ...(data.externalReference !== undefined && {
            external_reference: data.externalReference,
          }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      })

      await tx.applicationStatusHistory.create({
        data: {
          application_id: application.id,
          from_status: null,
          to_status: 'DRAFT',
          changed_by: data.createdBy,
        },
      })

      await StudentStatusHistoryRepo.transition(tx, {
        studentId: data.studentId,
        to: StudentStatus.APPLICATION_STARTED,
        allowedFrom: [StudentStatus.ASSIGNED, StudentStatus.FOLLOW_UP],
        source: 'APPLICATION_CREATED',
        changedBy: data.createdBy,
      })

      return tx.studentApplication.findUniqueOrThrow({
        where: { id: application.id },
        ...withRelations,
      })
    })
  }

  /**
   * Guarded on the status the service validated against: if another request
   * changed it in between, nothing is written and null comes back (-> 409).
   */
  static updateStatus = async (
    id: string,
    from: ApplicationStatus,
    to: ApplicationStatus,
    changedBy: string,
    note?: string,
    outerTx?: Tx,
  ) => {
    return withTx(outerTx, async (tx) => {
      const { count } = await tx.studentApplication.updateMany({
        where: { id, status: from },
        data: { status: to },
      })
      if (count === 0) return null

      await tx.applicationStatusHistory.create({
        data: {
          application_id: id,
          from_status: from,
          to_status: to,
          changed_by: changedBy,
          note: note ?? null,
        },
      })

      return tx.studentApplication.findUniqueOrThrow({
        where: { id },
        ...withRelations,
      })
    })
  }

  static updateDetails = async (
    id: string,
    data: UpdateApplicationDTO,
    db: Db = prisma,
  ) => {
    return db.studentApplication.update({
      where: { id },
      ...withRelations,
      data: {
        ...(data.intakeMonth !== undefined && {
          intake_month: data.intakeMonth,
        }),
        ...(data.intakeYear !== undefined && { intake_year: data.intakeYear }),
        ...(data.externalReference !== undefined && {
          external_reference: data.externalReference,
        }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })
  }
}
