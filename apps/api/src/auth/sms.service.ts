import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {}

  private formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('234')) return digits;
    if (digits.startsWith('0')) return `234${digits.slice(1)}`;
    return `234${digits}`;
  }

  /** Canonical E.164 form (+234…) so the same number can't be stored in several spellings. */
  normalizePhone(phone: string): string {
    const formatted = this.formatPhone(phone);
    if (!/^234[789]\d{9}$/.test(formatted)) {
      throw new BadRequestException('Enter a valid Nigerian mobile number, e.g. +2348012345678');
    }
    return `+${formatted}`;
  }

  async sendOtp(phone: string, code: string): Promise<boolean> {
    const apiKey = this.config.get('TERMII_API_KEY');
    const senderId = this.config.get('TERMII_SENDER_ID', 'Revyu');

    if (!apiKey) {
      this.logger.warn('TERMII_API_KEY not set — SMS not sent (set OTP_DEV_MODE=true for local testing)');
      return false;
    }

    const to = this.formatPhone(phone);
    const message = `Your Revyu verification code is ${code}. Valid for 10 minutes.`;

    try {
      const res = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          from: senderId,
          sms: message,
          type: 'plain',
          channel: 'generic',
          api_key: apiKey,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`Termii error: ${res.status} ${body}`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error('Termii request failed', err);
      return false;
    }
  }
}
