import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageMeta, skipTake } from '../common/pagination';

type Db = Prisma.TransactionClient | PrismaService;

export interface AuditActor {
  id: string;
  role?: string;
}

export interface AuditEntry {
  /** dot.separated verb, e.g. "claim.approve", "business.merge", "user.suspend". */
  action: string;
  /** user | business | review | claim | submission | report | dispute | admin_role | … */
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail for sensitive actions (PRD §8.5): actor, action, affected record,
 * timestamp. There is no update or delete path for audit rows anywhere in the API.
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
      metadata: (entry.metadata ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
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

  async list(params: {
    page: number;
    limit: number;
    targetType?: string;
    targetId?: string;
    actorId?: string;
    action?: string;
  }) {
    const where: Prisma.AuditLogWhereInput = {
      targetType: params.targetType,
      targetId: params.targetId,
      actorId: params.actorId,
      ...(params.action ? { action: { startsWith: params.action } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(params.page, params.limit),
        include: { actor: { select: { username: true, displayName: true } } },
      }),
    ]);
    return { data: rows, meta: pageMeta(params.page, params.limit, total) };
  }
}
