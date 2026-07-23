#!/usr/bin/env npx tsx
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb } from '@/src/db/client';
import type { AdminSession } from '@/src/lib/auth/session';
import { getPendingPaymentReviewsForRequest } from '@/src/services/paymentProofQueue';
import { loadMoveOutPipelineBundle } from '@/src/services/moveOutPipelineService';
import { listPendingBookingApprovalsForSync } from '@/src/services/unifiedOperationsQueue';

loadProductionAuditEnv();
requireDatabaseUrl('verify-operations-badge-lite.ts');

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'lite',
  adminId: 'lite',
  email: 'audit@system',
  fullName: 'Lite',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  const [reviews, moveOut, bookingApprovals] = await Promise.all([
    getPendingPaymentReviewsForRequest(CRON),
    loadMoveOutPipelineBundle(CRON, { syncSettlements: false }),
    listPendingBookingApprovalsForSync(CRON),
  ]);
  console.log(JSON.stringify({
    paymentReviews: reviews.length,
    moveOutActive: moveOut.activeItems.length,
    bookingApprovals: bookingApprovals.length,
    liteTotal: reviews.length + moveOut.activeItems.length + bookingApprovals.length,
  }, null, 2));
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
