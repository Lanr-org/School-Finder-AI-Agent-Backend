type InvitationData = {
  fullName: string
  email: string
  role: 'ADMIN' | 'ADVISOR' | 'OPERATIONS'
  phone?: string | null
}

type CreateAndInviteData = InvitationData & {
  publicId: string
  status: 'INVITED' | 'ACTIVE' | 'DISABLED'
  adminId: string
  token_hash: string
  expiresAt: Date
  sent_at: Date
  last_sent_at: Date
}

type InviteEmailData = {
  fullName: string
  inviterName: string
  inviteUrl: string
  to: string
  role: 'ADMIN' | 'ADVISOR' | 'OPERATIONS'
  /** TTL in minutes, used to render expiry text in the email body */
  expiresInMinutes: number
}

type UpdateInvitationData = {
  id: string
  hashToken: string
  expiresAt: Date
  lastSentAt: Date
  count: number
}

type UpdateTeamMemberData = {
  fullName?: string
  phone?: string | null
  email?: string 
}

type UpdateTeamMemberStatusData = {
  status: 'ACTIVE' | 'DISABLED'
}

export {
  InvitationData,
  CreateAndInviteData,
  InviteEmailData,
  UpdateInvitationData,
  UpdateTeamMemberData,
  UpdateTeamMemberStatusData,
}
