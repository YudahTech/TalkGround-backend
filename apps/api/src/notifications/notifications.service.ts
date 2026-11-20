import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AppConfig } from '../common/app-config';
import { pageMeta, skipTake } from '../common/pagination';

/**
 * PRD v2.5 §7.14 — the only transactional emails the MVP sends.
 * Report submissions get no email, and the reported party is never told who reported.
 */
export type NotificationKind =
  | 'claim.decision'
  | 'review.business_response'
  | 'dispute.update'
  | 'account.security';

const MAX_ATTEMPTS = 5;
const RETRY_INTERVAL_MS = 5 * 60 * 1000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Every email is stored with its delivery status before sending (§7.14 "record delivery status").
 * Sending never throws: a failed email must not roll back the business action that triggered it.
 * Failed emails are retried automatically with backoff, and staff can retry them by hand.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private appConfig: AppConfig,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.retryFailed(), RETRY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  frontendUrl(path = ''): string {
    return `${this.appConfig.frontendUrl}${path}`;
  }

  /** Queue + send one email to the account's own address. Never throws. */
  async toUser(
    userId: string,
    kind: NotificationKind,
    subject: string,
    paragraphs: string[],
    link?: { label: string; path: string },
  ): Promise<void> {
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
      const row = await this.prisma.notificationEmail.create({
        data: { userId, to: user.email, kind, subject, text, html },
      });
      await this.deliver(row.id);
    } catch (err) {
      this.logger.error(
        `Notification "${subject}" could not be queued`,
        err as Error,
      );
    }
  }

  /** Every active member of a business. */
  async toBusiness(
    businessId: string,
    kind: NotificationKind,
    subject: string,
    paragraphs: string[],
    link?: { label: string; path: string },
  ) {
    const members = await this.prisma.businessMember.findMany({
      where: { businessId, revokedAt: null },
      select: { userId: true },
    });
    await Promise.all(
      members.map((m) =>
        this.toUser(m.userId, kind, subject, paragraphs, link),
      ),
    );
  }

  private async deliver(id: string): Promise<boolean> {
    const row = await this.prisma.notificationEmail.findUnique({
      where: { id },
    });
    if (!row || row.status === EmailStatus.SENT) return true;
    let ok = false;
    let error: string | null = null;
    try {
      ok = await this.email.send({
        to: row.to,
        subject: row.subject,
        text: row.text,
        html: row.html,
      });
      if (!ok)
        error = this.email.isConfigured()
          ? 'Provider rejected the message'
          : 'Email provider not configured';
    } catch (err) {
      error = (err as Error).message;
    }
    await this.prisma.notificationEmail.update({
      where: { id },
      data: ok
        ? {
            status: EmailStatus.SENT,
            sentAt: new Date(),
            attempts: { increment: 1 },
            lastError: null,
          }
        : {
            status: EmailStatus.FAILED,
            attempts: { increment: 1 },
            lastError: error,
          },
    });
    return ok;
  }

  /** Background retry with backoff (attempt n waits n × 5 minutes). */
  async retryFailed(limit = 50) {
    if (!this.email.isConfigured()) return { retried: 0 };
    const due = await this.prisma.notificationEmail.findMany({
      where: { status: EmailStatus.FAILED, attempts: { lt: MAX_ATTEMPTS } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
    let retried = 0;
    for (const row of due) {
      if (
        Date.now() - row.updatedAt.getTime() <
        row.attempts * RETRY_INTERVAL_MS
      )
        continue;
      await this.deliver(row.id);
      retried++;
    }
    return { retried };
  }

  /** Staff: delivery log. */
  async list(status: string | undefined, page: number, limit: number) {
    const where = status ? { status: status.toUpperCase() as EmailStatus } : {};
    const [total, rows] = await Promise.all([
      this.prisma.notificationEmail.count({ where }),
      this.prisma.notificationEmail.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(page, limit),
        select: {
          id: true,
          to: true,
          kind: true,
          subject: true,
          status: true,
          attempts: true,
          lastError: true,
          sentAt: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({ ...r, status: r.status.toLowerCase() })),
      meta: pageMeta(page, limit, total),
    };
  }

  /** Staff: retry one failed email now. */
  async retryOne(id: string) {
    const ok = await this.deliver(id);
    const row = await this.prisma.notificationEmail.findUniqueOrThrow({
      where: { id },
    });
    return {
      data: {
        id,
        status: row.status.toLowerCase(),
        delivered: ok,
        attempts: row.attempts,
      },
    };
  }
}
