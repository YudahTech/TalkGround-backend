import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Decision notifications (PRD §8.4 step 5: notify relevant parties). Best effort: a failed
 * email never fails the decision that triggered it.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  frontendUrl(path = ''): string {
    const base = (
      this.config.get<string>('FRONTEND_URL') ??
      (this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000').split(
        ',',
      )[0]
    ).replace(/\/$/, '');
    return `${base}${path}`;
  }

  async toUser(
    userId: string,
    subject: string,
    paragraphs: string[],
    link?: { label: string; path: string },
  ) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return;
      const url = link ? this.frontendUrl(link.path) : null;
      const text = [
        `Hi ${user.displayName},`,
        '',
        ...paragraphs,
        ...(url ? ['', `${link!.label}: ${url}`] : []),
        '',
        '— TalkGround',
      ].join('\n');
      const html = [
        `<p>Hi ${escapeHtml(user.displayName)},</p>`,
        ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
        ...(url
          ? [
              `<p><a href="${escapeHtml(url)}">${escapeHtml(link!.label)}</a></p>`,
            ]
          : []),
        '<p>— TalkGround</p>',
      ].join('');
      await this.email.send({ to: user.email, subject, text, html });
    } catch (err) {
      this.logger.error(`Notification "${subject}" failed`, err as Error);
    }
  }

  /** Every active manager of a business. */
  async toBusiness(
    businessId: string,
    subject: string,
    paragraphs: string[],
    link?: { label: string; path: string },
  ) {
    const members = await this.prisma.businessMember.findMany({
      where: { businessId, revokedAt: null },
      select: { userId: true },
    });
    await Promise.all(
      members.map((m) => this.toUser(m.userId, subject, paragraphs, link)),
    );
  }
}
