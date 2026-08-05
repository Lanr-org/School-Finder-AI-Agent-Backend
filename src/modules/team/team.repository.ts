import prisma from '../../database/prisma'
import type {
  CreateAndInviteData,
  UpdateInvitationData,
  UpdateTeamMemberData,
} from './team.types'

class TeamRepo {
  // ── Invitations ────────────────────────────────────────────────────────────

  static async CreateInviteUser(data: CreateAndInviteData) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          public_id: data.publicId,
          full_name: data.fullName,
          email: data.email,
          // Prisma's exactOptionalPropertyTypes requires null, not undefined, for nullable columns
          phone: data.phone ?? null,
          role: data.role,
          status: data.status,
        },
      })

      const invite = await tx.team_Invitations.create({
        data: {
          user_id: user.id,
          invited_by_user_id: data.adminId,
          token_hash: data.token_hash,
          expires_at: data.expiresAt,
          sent_at: data.sent_at,
          last_sent_at: data.last_sent_at,
        },
      })

      return { user, invite }
    })
  }

  static async findInvitationById(id: string) {
    return prisma.team_Invitations.findUnique({
      where: { id },
      include: { user: true },
    })
  }

  static async FindTeamInvitation(where: { token_hash?: string; id?: string }) {
    return prisma.team_Invitations.findFirst({
      where,
      include: { user: true },
    })
  }

  static async UpdateTeamInvitation(data: UpdateInvitationData) {
    return prisma.team_Invitations.update({
      where: { id: data.id },
      data: {
        token_hash: data.hashToken,
        expires_at: data.expiresAt,
        last_sent_at: data.lastSentAt,
        send_count: data.count,
      },
    })
  }

  static async CancelInvitation(id:string, user_id: string) {
     return prisma.$transaction( async (tx)=>{
        await tx.team_Invitations.update({
          where:{id},
          data:{canceled_at: new Date()}
        })

        await tx.users.delete({
          where:{id:user_id}
        })
     })
   
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  static async findAllUsers() {
    return prisma.users.findMany({
      orderBy: { created_at: 'desc' },
    })
  }

  static async findUserByPublicId(publicId: string) {
    return prisma.users.findFirst({
      where: { public_id: publicId },
    })
  }

  static async updateUser(id: string, data: UpdateTeamMemberData) {
    return prisma.users.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined && { full_name: data.fullName }),
        // null is valid for Prisma's nullable VarChar; skip the key entirely when not provided
        ...(data.phone !== undefined && { phone: data.phone ?? null }),
        ...(data.email !== undefined && { email: data.email }),
      },
    })
  }

  static async updateUserStatus(id: string, status: 'ACTIVE' | 'DISABLED') {
    return prisma.users.update({
      where: { id },
      data: { status },
    })
  }
}

export default TeamRepo
