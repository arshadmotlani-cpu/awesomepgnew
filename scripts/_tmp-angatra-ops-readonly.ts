/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.prod.live' });
dotenv.config({ path: '.env.production.local' });

import { and, eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { vacatingRequests, bookings, customers } from '@/src/db/schema';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { buildMoveOutPipeline, activePipelineItems } from '@/src/lib/moveOut/moveOutPipeline';
import { moveOutRequiresAdminActionNow, moveOutOperationsQueueTarget } from '@/src/lib/operations/moveOutAdminAction';
import { deriveMoveOutWorkflowStage } from '@/src/lib/moveOut/moveOutWorkflowStages';
import { loadPendingVacatingApprovalPreviews } from '@/src/lib/vacating/loadAdminVacatingPageData';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

const BOOKING_ID = 'ad24c0d2-f2d1-4c08-99d1-74487560feb5';
const VR_ID = '198831f7-189c-4aaf-874b-c066d6323d05';

async function main() {
  const rows = await db.execute(sql`
    SELECT id, booking_id, status, vacating_date::text, notice_given_date::text,
           original_notice_submitted_at, monthly_rent_paise_snapshot, deduction_paise
    FROM vacating_requests
    WHERE booking_id = ${BOOKING_ID}::uuid OR id = ${VR_ID}::uuid
    ORDER BY created_at DESC
  `);
  console.log('DB_ROWS', JSON.stringify((rows as any).rows ?? rows, null, 2));

  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) {
    console.log('listAdminVacatingRequests failed', vacatingRes);
    return;
  }
  const angatra = vacatingRes.data.filter((r) => r.bookingId === BOOKING_ID || r.id === VR_ID);
  console.log('ADMIN_ROWS', JSON.stringify(angatra.map(r => ({
    id: r.id, status: r.status, vacatingDate: r.vacatingDate,
    noticeGivenDate: r.noticeGivenDate, originalNoticeSubmittedAt: r.originalNoticeSubmittedAt,
    bookingCode: r.bookingCode, pgId: r.pgId,
  })), null, 2));

  const deposit = await getDepositSummaryForBooking(BOOKING_ID);
  const depositHeld = { [BOOKING_ID]: deposit.refundableBalancePaise ?? deposit.heldPaise ?? 0 };

  for (const row of angatra) {
    try {
      const pipeline = buildMoveOutPipeline(
        [{
          id: row.id,
          bookingId: row.bookingId,
          bookingCode: row.bookingCode,
          customerId: row.customerId,
          customerFullName: row.customerFullName,
          customerPhone: row.customerPhone,
          pgName: row.pgName,
          bedCode: row.bedCode,
          roomNumber: row.roomNumber,
          noticeGivenDate: row.noticeGivenDate,
          vacatingDate: row.vacatingDate,
          noticeCompliant: row.noticeCompliant,
          status: row.status,
          resolvedAt: row.resolvedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          deductionPaise: row.deductionPaise,
          depositHeldPaise: depositHeld[row.bookingId] ?? 0,
          noticeRentCoveredDays: row.noticeRentCoveredDays ?? 0,
          noticeChargeableDays: row.noticeChargeableDays ?? 0,
          durationMode: row.durationMode,
          stayType: row.stayType,
        }],
        [],
      );
      const item = pipeline[0]!;
      const workflow = deriveMoveOutWorkflowStage(item);
      console.log('PIPELINE_ITEM', JSON.stringify({
        vacatingRequestId: item.vacatingRequestId,
        vacatingStatus: item.vacatingStatus,
        settlementStatus: item.settlementStatus,
        stage: item.stage,
        continueKind: item.continueKind,
        estimatedRefundPaise: item.estimatedRefundPaise,
        requiresAdminActionNow: moveOutRequiresAdminActionNow(item),
        opsTarget: moveOutOperationsQueueTarget(item),
        workflow,
        inActive: activePipelineItems(pipeline).length,
      }, null, 2));
    } catch (e) {
      console.error('pipeline build failed', e);
    }
  }

  try {
    const previews = await loadPendingVacatingApprovalPreviews({
      vacatingRows: angatra,
      depositHeldByBooking: depositHeld,
    });
    const p = previews[VR_ID] ?? Object.values(previews)[0];
    console.log('APPROVAL_PREVIEW', JSON.stringify({
      keys: Object.keys(previews),
      hasEstimatedSettlement: Boolean(p?.estimatedSettlement),
      estimatedRefundPaise: p?.estimatedSettlement?.estimatedRefundPaise ?? p?.estimatedRefundPaise,
      unused: p?.estimatedSettlement?.waterfall?.rentBucket?.unusedPaise,
      noticeFull: p?.estimatedSettlement?.waterfall?.notice?.fullPaise,
      depositCollected: p?.estimatedSettlement?.waterfall?.depositBucket?.collectedPaise,
      total: p?.estimatedSettlement?.waterfall?.refund?.totalPaise,
      errorHint: p && !p.estimatedSettlement ? 'missing estimatedSettlement' : null,
    }, null, 2));
  } catch (e) {
    console.error('approval preview FAILED', e);
  }
}

main().catch(console.error).finally(() => closeDb());
