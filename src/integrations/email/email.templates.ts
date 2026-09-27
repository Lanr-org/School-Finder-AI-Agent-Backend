import type { InviteEmailData } from '../../modules/team/team.types'
import type { PasswordResetEmailData, SendEmailData } from './email.types'

// The email palette in one place. Smetase's final blue isn't decided yet, so the
// button uses the navy base; change `ink` (or add an accent) once it's locked.
const COLORS = {
  ink: '#0B132B',
  text: '#374151',
  muted: '#6B7280',
  line: '#E5E7EB',
  background: '#FFFFFF',
}

// Web fonts are unreliable in email clients, so use the system stack.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

const escapeHtml = (value: string): string => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// ADVISOR -> Advisor
const formatRole = (role: string): string => role.charAt(0) + role.slice(1).toLowerCase()

// All string fields must already be HTML-escaped.
type EmailContent = {
  title: string
  preheader: string
  greeting: string
  body: string
  action: { label: string; url: string }
  note: string
  footer: string
}

const renderEmail = (email: EmailContent): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${email.title}</title>
  </head>
  <body style="margin:0;padding:0;background:${COLORS.background};font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${email.preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.background};">
      <tr>
        <td align="center" style="padding:48px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;font-family:${FONT};">
            <tr>
              <td style="padding:0 0 40px;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:${COLORS.ink};">Smetase</td>
            </tr>
            <tr>
              <td style="padding:0 0 24px;font-size:26px;line-height:34px;font-weight:600;letter-spacing:-0.02em;color:${COLORS.ink};">${email.title}</td>
            </tr>
            <tr>
              <td style="padding:0 0 16px;font-size:15px;line-height:24px;color:${COLORS.text};">${email.greeting}</td>
            </tr>
            <tr>
              <td style="padding:0 0 32px;font-size:15px;line-height:24px;color:${COLORS.text};">${email.body}</td>
            </tr>
            <tr>
              <td style="padding:0 0 32px;">
                <a href="${email.action.url}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:${COLORS.ink};color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">${email.action.label}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 40px;font-size:14px;line-height:22px;color:${COLORS.muted};">${email.note}</td>
            </tr>
            <tr>
              <td style="padding:24px 0 0;border-top:1px solid ${COLORS.line};font-size:12px;line-height:20px;color:${COLORS.muted};">
                ${email.footer}<br><br>
                Button not working? Paste this link into your browser:<br>
                <a href="${email.action.url}" style="color:${COLORS.muted};word-break:break-all;">${email.action.url}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

export const buildPasswordResetEmail = (data: PasswordResetEmailData): SendEmailData => {
  const expiresInMinutes = data.expiresInMinutes.toString()

  const text = [
    `Hi ${data.fullName},`,
    '',
    `Use this link to reset your Smetase password. It expires in ${expiresInMinutes} minutes:`,
    data.resetUrl,
    '',
    "Didn't request this? You can ignore this email. Your password won't change.",
    '',
    'Smetase',
  ].join('\n')

  const html = renderEmail({
    title: 'Reset your password',
    preheader: 'Choose a new password for your Smetase account.',
    greeting: `Hi ${escapeHtml(data.fullName)},`,
    body: 'We received a request to reset your Smetase password. Use the button below to choose a new one.',
    action: { label: 'Reset password', url: escapeHtml(data.resetUrl) },
    note: `This link expires in ${expiresInMinutes} minutes.`,
    footer: "Didn't request this? You can ignore this email. Your password won't change.",
  })

  return { to: data.to, subject: 'Reset your Smetase password', html, text }
}

export const buildInviteEmail = (data: InviteEmailData): SendEmailData => {
  const inviterName = escapeHtml(data.inviterName)
  const role = formatRole(data.role)
  const expiresInMinutes = data.expiresInMinutes.toString()

  const text = [
    `Hi ${data.fullName},`,
    '',
    `${data.inviterName} has invited you to join Smetase as ${role}.`,
    `Use this link to set your password. It expires in ${expiresInMinutes} minutes:`,
    data.inviteUrl,
    '',
    "Not expecting this? You can ignore this email and the account won't be activated.",
    '',
    'Smetase',
  ].join('\n')

  const html = renderEmail({
    title: "You're invited to Smetase",
    preheader: `${inviterName} invited you to join Smetase.`,
    greeting: `Hi ${escapeHtml(data.fullName)},`,
    body: `<strong style="color:${COLORS.ink};">${inviterName}</strong> has invited you to join Smetase as ${role}. Set your password to get started.`,
    action: { label: 'Accept invitation', url: escapeHtml(data.inviteUrl) },
    note: `This invitation expires in ${expiresInMinutes} minutes. If it expires, ask ${inviterName} to send a new one.`,
    footer: "Not expecting this? You can ignore this email and the account won't be activated.",
  })

  // Subjects are plain text, so they use the raw name (not HTML-escaped).
  return { to: data.to, subject: `${data.inviterName} invited you to Smetase as ${role}`, html, text }
}
