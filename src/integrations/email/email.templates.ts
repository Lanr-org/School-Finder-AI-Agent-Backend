import type { InviteEmailData } from '../../modules/team/team.types'
import type { PasswordResetEmailData, SendEmailData } from './email.types'

// The landing page palette (smetase-landing/src/styles/global.css): black and white, Smetase blue as the accent.
const COLORS = {
  ink: '#0a0a0a',
  paper: '#ffffff',
  subtle: '#f5f5f5',
  muted: '#737373',
  dim: '#a3a3a3',
  blue: '#2b4bff',
}

// Brand fonts load in Apple Mail and a few others; Gmail and Outlook fall back to the system stack.
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=Unbounded:wght@600;800&display=swap'
// White-on-black PNG served by the landing site (smetase-landing/public/email/logo.png): mail clients don't show SVG.
const LOGO_URL = 'https://smetase.com/email/logo.png'
const FONT = "'Instrument Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const DISPLAY = "'Unbounded','Arial Black',Helvetica,Arial,sans-serif"

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
    <meta name="supported-color-schemes" content="light">
    <title>${email.title}</title>
    <link href="${FONT_URL}" rel="stylesheet">
  </head>
  <body style="margin:0;padding:0;background:${COLORS.subtle};font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${email.preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.subtle};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${COLORS.paper};font-family:${FONT};">
            <tr>
              <td style="padding:28px 36px;background:${COLORS.ink};font-family:${DISPLAY};font-size:22px;line-height:26px;font-weight:800;letter-spacing:-0.03em;color:${COLORS.paper};">
                <img src="${LOGO_URL}" width="152" height="28" alt="Smetase" style="display:block;border:0;outline:none;text-decoration:none;width:152px;height:28px;color:${COLORS.paper};">
              </td>
            </tr>
            <tr>
              <td height="6" style="padding:0;background:${COLORS.blue};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:48px 36px 28px;font-family:${DISPLAY};font-size:34px;line-height:38px;font-weight:800;letter-spacing:-0.04em;color:${COLORS.ink};">${email.title}</td>
            </tr>
            <tr>
              <td style="padding:0 36px 12px;font-size:16px;line-height:26px;font-weight:600;color:${COLORS.ink};">${email.greeting}</td>
            </tr>
            <tr>
              <td style="padding:0 36px 36px;font-size:16px;line-height:26px;color:${COLORS.ink};">${email.body}</td>
            </tr>
            <tr>
              <td style="padding:0 36px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="background:${COLORS.blue};">
                      <a href="${email.action.url}" style="display:block;padding:18px 28px;font-family:${DISPLAY};font-size:15px;line-height:18px;font-weight:600;letter-spacing:-0.01em;color:${COLORS.paper};text-decoration:none;">${email.action.label}&nbsp;&nbsp;&rarr;</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px 48px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:0;font-size:14px;line-height:22px;color:${COLORS.muted};">${email.note}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 36px 36px;background:${COLORS.ink};font-size:13px;line-height:21px;color:${COLORS.dim};">
                ${email.footer}<br><br>
                Button not working? Paste this link into your browser:<br>
                <a href="${email.action.url}" style="color:${COLORS.paper};word-break:break-all;">${email.action.url}</a>
                <div style="padding:28px 0 0;font-family:${DISPLAY};font-size:15px;line-height:18px;font-weight:800;letter-spacing:-0.03em;color:${COLORS.paper};">Smetase</div>
                <div style="padding:6px 0 0;font-size:13px;line-height:20px;color:${COLORS.dim};">Study abroad planning for Nigerian students.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

// "60 minutes", or "7 days" / "1 day" when the time is whole days.
const formatExpiry = (minutes: number): string => {
  const minutesPerDay = 24 * 60
  if (minutes >= minutesPerDay && minutes % minutesPerDay === 0) {
    const days = minutes / minutesPerDay
    return `${days.toString()} ${days === 1 ? 'day' : 'days'}`
  }
  return `${minutes.toString()} minutes`
}

export const buildPasswordResetEmail = (data: PasswordResetEmailData): SendEmailData => {
  const expiresIn = formatExpiry(data.expiresInMinutes)

  const text = [
    `Hi ${data.fullName},`,
    '',
    `Use this link to reset your Smetase password. It expires in ${expiresIn}:`,
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
    note: `This link expires in ${expiresIn}.`,
    footer: "Didn't request this? You can ignore this email. Your password won't change.",
  })

  return { to: data.to, subject: 'Reset your Smetase password', html, text }
}

export const buildInviteEmail = (data: InviteEmailData): SendEmailData => {
  const inviterName = escapeHtml(data.inviterName)
  const role = formatRole(data.role)
  const expiresIn = formatExpiry(data.expiresInMinutes)

  const text = [
    `Hi ${data.fullName},`,
    '',
    `${data.inviterName} has invited you to join Smetase as ${role}.`,
    `Use this link to set your password. It expires in ${expiresIn}:`,
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
    note: `This invitation expires in ${expiresIn}. If it expires, ask ${inviterName} to send a new one.`,
    footer: "Not expecting this? You can ignore this email and the account won't be activated.",
  })

  // Subjects are plain text, so they use the raw name (not HTML-escaped).
  return { to: data.to, subject: `${data.inviterName} invited you to Smetase as ${role}`, html, text }
}
