import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageMeta, skipTake } from '../common/pagination';

type Db = Prisma.TransactionClient | PrismaService;

export interface AuditActor {
  id: string;
  role?: string;
}

/** PRD v2.5 §8.5 target types. */
export type AuditTarget =
  | 'review'
  | 'business'
  | 'user'
  | 'suggestion'
  | 'claim'
  | 'report'
  | 'dispute'
  | 'category'
  | 'role';

export interface AuditEntry {
  /** dot.separated verb, e.g. "claim.approve", "business.merge", "user.suspend". */
  action: string;
  targetType: AuditTarget;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  page: number;
  limit: number;
  targetType?: string;
  targetId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
}

const json = (v: unknown) =>
  v === undefined || v === null ? undefined : (v as Prisma.InputJsonValue);

/**
 * Append-only audit trail (PRD §8.5): actor, action, target type and id, before/after values,
 * reason and timestamp. There is no update or delete path for audit rows anywhere in the API.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Pass `db` (a transaction) when the audit row must commit or roll back with the action.
   * Without it, an audit failure is logged but does not undo the action that already happened.
   */
  async record(
    actor: AuditActor | null,
    entry: AuditEntry,
    db?: Db,
  ): Promise<void> {
    const data = {
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: json(entry.before),
      after: json(entry.after),
      reason: entry.reason ?? null,
      metadata: json(entry.metadata),
    };
    if (db) {
      await db.auditLog.create({ data });
      return;
    }
    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for ${entry.action}`,
        err as Error,
      );
    }
  }

  private where(q: AuditQuery): Prisma.AuditLogWhereInput {
    return {
      targetType: q.targetType,
      targetId: q.targetId,
      actorId: q.actorId,
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
  }

  async list(q: AuditQuery) {
    const where = this.where(q);
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.limit),
        include: { actor: { select: { username: true, displayName: true } } },
      }),
    ]);
    return { data: rows, meta: pageMeta(q.page, q.limit, total) };
  }

  /** CSV export (auditlog.export), newest first, at most 10,000 rows per request. */
  async exportCsv(q: Omit<AuditQuery, 'page' | 'limit'>): Promise<string> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.where({ ...q, page: 1, limit: 1 }),
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      include: { actor: { select: { username: true } } },
    });
    const cell = (v: unknown) => {
      const s =
        v === null || v === undefined
          ? ''
          : typeof v === 'string'
            ? v
            : JSON.stringify(v);
      // Neutralise spreadsheet formula injection and quote every cell.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const header = [
      'createdAt',
      'actorId',
      'actorUsername',
      'actorRole',
      'action',
      'targetType',
      'targetId',
      'reason',
      'before',
      'after',
      'metadata',
    ];
    const lines = rows.map((r) =>
      [
        r.createdAt.toISOString(),
        r.actorId,
        r.actor?.username,
        r.actorRole,
        r.action,
        r.targetType,
        r.targetId,
        r.reason,
        r.before,
        r.after,
        r.metadata,
      ]
        .map(cell)
        .join(','),
    );
    return [header.join(','), ...lines].join('\r\n');
  }
}
