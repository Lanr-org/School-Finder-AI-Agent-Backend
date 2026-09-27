import { describe, expect, it } from 'vitest'
import { buildInviteEmail, buildPasswordResetEmail } from '../src/integrations/email/email.templates'

describe('email templates', () => {
  describe('buildInviteEmail', () => {
    const email = buildInviteEmail({
      to: 'new@example.com',
      fullName: 'Ada <Lovelace>',
      inviterName: "Tunde O'Brien",
      inviteUrl: 'https://app.example.com/set-password/abc?x=1&y=2',
      role: 'ADVISOR',
      expiresInMinutes: 60,
    })

    it('uses the raw inviter name and a formatted role in the subject', () => {
      expect(email.subject).toBe("Tunde O'Brien invited you to Smetase as Advisor")
    })

    it('HTML-escapes names and the URL in the body', () => {
      expect(email.html).toContain('Hi Ada &lt;Lovelace&gt;,')
      expect(email.html).toContain('Tunde O&#39;Brien')
      expect(email.html).not.toContain('<Lovelace>')
      expect(email.html).toContain('href="https://app.example.com/set-password/abc?x=1&amp;y=2"')
    })

    it('includes the link in the button, the fallback link and the plain-text version', () => {
      const escapedUrl = 'https://app.example.com/set-password/abc?x=1&amp;y=2'
      expect(email.html.split(escapedUrl).length - 1).toBe(3) // button href, fallback href, fallback text
      expect(email.text).toContain('https://app.example.com/set-password/abc?x=1&y=2')
      expect(email.text).toContain('as Advisor')
      expect(email.text).toContain('expires in 60 minutes')
    })
  })

  describe('buildPasswordResetEmail', () => {
    const email = buildPasswordResetEmail({
      to: 'user@example.com',
      fullName: 'Grace & Co',
      resetUrl: 'https://app.example.com/reset-password/tok',
      expiresInMinutes: 30,
    })

    it('has the Smetase subject', () => {
      expect(email.subject).toBe('Reset your Smetase password')
    })

    it('escapes the name and includes the link and expiry', () => {
      expect(email.html).toContain('Hi Grace &amp; Co,')
      expect(email.html).toContain('href="https://app.example.com/reset-password/tok"')
      expect(email.html).toContain('expires in 30 minutes')
      expect(email.text).toContain('https://app.example.com/reset-password/tok')
    })
  })
})
