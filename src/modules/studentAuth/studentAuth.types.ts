export type ClientInfo = { ipAddress: string | null; userAgent: string | null }
export type GoogleSignInInput = ClientInfo & { credential: string }
export type StudentRefreshInput = ClientInfo & { refreshToken: string }

export type StudentSummary = {
  publicId: string
  firstName: string
  fullName: string
  email: string | null
}
