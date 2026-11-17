import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Transactional email via Brevo (https://developers.brevo.com/reference/sendtransacemail).
 *
 * Env:
 * - BREVO_API_KEY   — API key (xkeysib-…). When missing, emails are logged instead of sent.
 * - EMAIL_FROM      — sender address; must be a verified sender/domain in Brevo.
 * - EMAIL_FROM_NAME — display name (default "TalkGround").
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private config: ConfigService) {}

  isConfigured(): boolean {
    return !!(
      this.config.get('BREVO_API_KEY') && this.config.get('EMAIL_FROM')
    );
  }

  /** Returns true when the provider accepted the message. Never throws. */
  async send(message: EmailMessage): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.warn(
        `[EMAIL NOT CONFIGURED] to=${message.to} subject="${message.subject}" — set BREVO_API_KEY and EMAIL_FROM`,
      );
      return false;
    }

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': this.config.get<string>('BREVO_API_KEY')!,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: {
            email: this.config.get<string>('EMAIL_FROM'),
            name: this.config.get<string>('EMAIL_FROM_NAME', 'TalkGround'),
          },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
      });

      if (!res.ok) {
        this.logger.error(`Brevo error ${res.status}: ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('Brevo request failed', err as Error);
      return false;
    }
  }

  verificationCode(to: string, displayName: string, code: string) {
    return this.send({
      to,
      subject: `${code} is your TalkGround verification code`,
      text: `Hi ${displayName},\n\nYour TalkGround email verification code is ${code}. It expires in 10 minutes.\n\nIf you didn't create a TalkGround account, ignore this email.`,
      html: layout(
        `<p>Hi ${escapeHtml(displayName)},</p>
         <p>Your TalkGround email verification code is:</p>
         <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
         <p>It expires in 10 minutes.</p>
         <p style="color:#666">If you didn't create a TalkGround account, ignore this email.</p>`,
      ),
    });
  }

  passwordReset(to: string, displayName: string, link: string) {
    return this.send({
      to,
      subject: 'Reset your TalkGround password',
      text: `Hi ${displayName},\n\nReset your password with this link (valid for 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email — your password won't change.`,
      html: layout(
        `<p>Hi ${escapeHtml(displayName)},</p>
         <p>We received a request to reset your TalkGround password. This link is valid for 30 minutes and can be used once.</p>
         <p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Reset password</a></p>
         <p style="color:#666">If you didn't ask for this, ignore this email — your password won't change.</p>`,
      ),
    });
  }

  passwordChanged(to: string, displayName: string) {
    return this.send({
      to,
      subject: 'Your TalkGround password was changed',
      text: `Hi ${displayName},\n\nYour TalkGround password was just changed and all sessions were signed out. If this wasn't you, reset your password immediately.`,
      html: layout(
        `<p>Hi ${escapeHtml(displayName)},</p>
         <p>Your TalkGround password was just changed and all sessions were signed out.</p>
         <p>If this wasn't you, reset your password immediately.</p>`,
      ),
    });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.5">
  <h2 style="margin:0 0 16px">TalkGround</h2>${body}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="color:#999;font-size:12px">TalkGround — real experiences, informed decisions.</p></div>`;
}
