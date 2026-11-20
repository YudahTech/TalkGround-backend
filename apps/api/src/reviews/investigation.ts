import { DisputeStatus, Prisma, ReportStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * PRD v2.5 §6.4: review.underInvestigation is true while the review has an open report or an
 * open dispute. Recalculated (never toggled) whenever a report or dispute opens or closes.
 */
export async function refreshUnderInvestigation(db: Db, reviewId: string) {
  const [reports, disputes] = await Promise.all([
    db.reviewReport.count({
      where: { reviewId, responseId: null, status: ReportStatus.OPEN },
    }),
    db.businessDispute.count({
      where: {
        reviewId,
        status: { in: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW] },
      },
    }),
  ]);
  const underInvestigation = reports + disputes > 0;
  await db.review.update({
    where: { id: reviewId },
    data: { underInvestigation },
  });
  return underInvestigation;
}
