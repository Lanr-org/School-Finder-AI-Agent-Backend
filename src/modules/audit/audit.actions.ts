// Single source of audit action names. Stored as varchar (not a DB enum) so
// adding an action never needs a migration.
export const AUDIT_ACTIONS = {
  LOGIN_FAILED: 'auth.login_failed',
  SESSION_REVOKED: 'auth.session_revoked',
  SESSIONS_REVOKED_ALL: 'auth.sessions_revoked_all',
  PASSWORD_CHANGED: 'auth.password_changed',
  PASSWORD_RESET: 'auth.password_reset',
  INVITATION_CREATED: 'team.invitation_created',
  INVITATION_RESENT: 'team.invitation_resent',
  INVITATION_CANCELED: 'team.invitation_canceled',
  INVITATION_ACCEPTED: 'team.invitation_accepted',
  MEMBER_UPDATED: 'team.member_updated',
  MEMBER_STATUS_CHANGED: 'team.member_status_changed',
  ADVISOR_ASSIGNED: 'student.advisor_assigned',
  ADVISOR_UNASSIGNED: 'student.advisor_unassigned',
  STUDENT_STATUS_CHANGED: 'student.status_changed',
  APPLICATION_CREATED: 'application.created',
  APPLICATION_STATUS_CHANGED: 'application.status_changed',
  SCHOOL_CREATED: 'school.created',
  SCHOOL_UPDATED: 'school.updated',
  SCHOOL_DEACTIVATED: 'school.deactivated',
  PROGRAM_CREATED: 'program.created',
  PROGRAM_UPDATED: 'program.updated',
  SETTING_VALUE_CREATED: 'setting.value_created',
  SETTING_VALUE_UPDATED: 'setting.value_updated',
  SETTING_VALUE_DELETED: 'setting.value_deleted',
  RECOMMENDATION_WEIGHTS_UPDATED: 'recommendation_weights.updated',
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

export const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTIONS) as [
  AuditAction,
  ...AuditAction[],
]

export const AUDIT_ENTITY_TYPES = [
  'user',
  'auth_session',
  'invitation',
  'student',
  'application',
  'school',
  'program',
  'setting_value',
  'recommendation_weights',
] as const

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]
