import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditActor {
  id: string;
  role?: string;
}

export interface AuditEntry {
  action: string;
  targetType: 'review' | 'brand' | 'user' | 'suggestion' | 'report';
  targetId: string;
  metadata?: Record<string, unknown>;
}

/** Append-only audit trail for sensitive actions (PRD §8.6). */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async record(actor: AuditActor | null, entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor?.id ?? null,
          actorRole: actor?.role ?? null,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: (entry.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
    } catch (err) {
      // An audit failure must be visible but must not undo the action that already happened.
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
  }) {
    const where: Prisma.AuditLogWhereInput = {
      targetType: params.targetType,
      targetId: params.targetId,
      actorId: params.actorId,
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        include: { actor: { select: { username: true, displayName: true } } },
      }),
    ]);
    return {
      data: rows,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
}
