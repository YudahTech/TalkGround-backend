import { Injectable } from '@nestjs/common';
import {
  ModerationActionType,
  ModerationTarget,
  PolicyReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/current-user.decorator';

type Db = Prisma.TransactionClient | PrismaService;

export interface ModerationRecord {
  targetType: ModerationTarget;
  targetId: string;
  action: ModerationActionType;
  reason?: PolicyReason | null;
  note?: string | null;
  reportId?: string | null;
  disputeId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * PRD §12 ModerationAction + §8.5 audit: every moderation decision is stored with its policy
 * ground, and mirrored into the audit log.
 */
@Injectable()
export class ModerationService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async record(actor: AuthUser, entry: ModerationRecord, db: Db = this.prisma) {
    const action = await db.moderationAction.create({
      data: {
        targetType: entry.targetType,
        targetId: entry.targetId,
        action: entry.action,
        reason: entry.reason ?? null,
        note: entry.note ?? null,
        reportId: entry.reportId ?? null,
        disputeId: entry.disputeId ?? null,
        actorId: actor.id,
      },
    });
    await this.audit.record(
      { id: actor.id, role: actor.adminRole ?? undefined },
      {
        action: `moderation.${entry.targetType.toLowerCase()}.${entry.action.toLowerCase()}`,
        targetType: entry.targetType.toLowerCase(),
        targetId: entry.targetId,
        metadata: {
          reason: entry.reason ?? null,
          note: entry.note ?? null,
          reportId: entry.reportId ?? null,
          disputeId: entry.disputeId ?? null,
          ...entry.metadata,
        },
      },
      db,
    );
    return action;
  }

  history(targetType: ModerationTarget, targetId: string) {
    return this.prisma.moderationAction.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { displayName: true, username: true } } },
    });
  }
}
