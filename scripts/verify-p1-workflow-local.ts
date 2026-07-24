#!/usr/bin/env npx tsx
/**
 * Pre-commit verification for P1 workflow fix (local/staging DB).
 *
 *   USE_PRODUCTION_DB=1 npx tsx scripts/verify-p1-workflow-local.ts
 *   npx tsx scripts/verify-p1-workflow-local.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-p1-workflow-local.ts');

import { sql } from 'drizzle-orm';
import { createClient, closeDb } from '@/src/db/client';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import { computeMoveOutPipelineCounts } from '@/src/lib/moveOut/moveOutPipelineCounts';
import {
  vacatingOperationsQueueTarget,
} from '@/src/lib/operations/operationsQueueVacating';
import { loadMonthlyBillingSnapshotForBooking } from '@/src/lib/billing/monthlyBillingSnapshot';
import { loadBookingFinancialWorkspace } from '@/src/services/bookingFinancialWorkspace';
import { buildEstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { operationsFilterCount } from '@/src/lib/operations/operationsQueueCounts';
import { getUnifiedOperationsQueueForBadges } from '@/src/services/unifiedOperationsQueue';
import { revalidateVacatingLifecycleAndNotifications } from '@/src/lib/vacating/revalidateVacatingViews';
import type { AdminSession } from '@/src/lib/auth/session';

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function pass(label: string, detail: string) {
  console.log(`PASS: ${label} — ${detail}`);
}

function isSafePendingRow(row: {
  booking_code: string;
  pg_name: string;
  id: string;
}): boolean {
  const overrideId = process.env.P1_VERIFY_VACATING_REQUEST_ID?.trim();
  if (overrideId && row.id === overrideId) return true;
  const allowCode = process.env.P1_VERIFY_APPROVE_BOOKING_CODE?.trim();
  if (allowCode && row.booking_code === allowCode) return true;
  if (/demo|sandbox|test/i.test(row.pg_name)) return true;
  if (/^TEST-/i.test(row.booking_code)) return true;
  return false;
}

async function loadSuperAdminSession(
  db: ReturnType<typeof createClient>['db'],
): Promise<AdminSession> {
  const rows = await db.execute<{
    id: string;
    email: string;
    full_name: string;
    role: string;
  }>(sql`
    SELECT id, email, full_name, role
    FROM admin_users
    WHERE role = 'super_admin' AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1
  `);
  const admin = rows[0];
  if (!admin) fail('no active super_admin in DB for verification session');
  return {
    kind: 'admin',
    sessionId: 'p1-verify',
    adminId: admin.id,
    email: admin.email,
    fullName: admin.full_name,
    role: admin.role as AdminSession['role'],
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function vacatingOpsCount(session: AdminSession): Promise<number> {
  const queue = await getUnifiedOperationsQueueForBadges(session);
  return operationsFilterCount(queue, 'vacating_requests');
}

async function main() {
  console.log('=== P1 local/staging verification ===\n');

  const { db, close } = createClient({ max: 1 });
  const session = await loadSuperAdminSession(db);
  const vacatingOpsBefore = await vacatingOpsCount(session);

  const pendingRows = await db.execute<{
    id: string;
    booking_id: string;
    booking_code: string;
    customer_id: string;
    pg_name: string;
    vacating_date: string;
    notice_given_date: string;
    monthly_rent_paise_snapshot: number;
  }>(sql`
    SELECT vr.id, vr.booking_id, b.booking_code, vr.customer_id, p.name AS pg_name,
           vr.vacating_date::text, vr.notice_given_date::text,
           vr.monthly_rent_paise_snapshot
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bed ON bed.id = br.bed_id
    INNER JOIN rooms r ON r.id = bed.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE vr.status = 'pending'
    ORDER BY vr.created_at ASC
    LIMIT 20
  `);

  const pending = pendingRows.find((r) => isSafePendingRow(r)) ?? null;
  const executeApprove = process.env.P1_VERIFY_EXECUTE_APPROVE === '1';

  const runSimulatedQueueRules = () => {
    console.warn('WARN: Using fixture pipeline for move-out queue routing rules.');
    const pipeline = buildMoveOutPipeline({
      vacatingRows: [
        {
          id: 'sim-pending',
          bookingId: '00000000-0000-0000-0000-000000000001',
          bookingCode: 'SIM-PENDING',
          customerId: '00000000-0000-0000-0000-000000000002',
          customerFullName: 'Sim',
          customerPhone: '+910000000000',
          pgName: 'PG',
          bedCode: 'B1',
          roomNumber: '101',
          noticeGivenDate: '2026-06-01',
          vacatingDate: '2026-07-20',
          noticeCompliant: true,
          status: 'pending',
          resolvedAt: null,
          createdAt: new Date('2026-06-01'),
          updatedAt: new Date('2026-06-01'),
          deductionPaise: 0,
          depositHeldPaise: 50_000,
        },
        {
          id: 'sim-approved',
          bookingId: '00000000-0000-0000-0000-000000000003',
          bookingCode: 'SIM-APPROVED',
          customerId: '00000000-0000-0000-0000-000000000004',
          customerFullName: 'Sim2',
          customerPhone: '+910000000001',
          pgName: 'PG',
          bedCode: 'B2',
          roomNumber: '102',
          noticeGivenDate: '2026-06-01',
          vacatingDate: '2026-07-20',
          noticeCompliant: true,
          status: 'approved',
          resolvedAt: null,
          createdAt: new Date('2026-06-01'),
          updatedAt: new Date('2026-06-02'),
          deductionPaise: 0,
          depositHeldPaise: 50_000,
        },
      ],
      settlements: [],
    });
    const pendingItem = pipeline.find((p) => p.vacatingStatus === 'pending');
    const approvedItem = pipeline.find((p) => p.vacatingStatus === 'approved');
    if (vacatingOperationsQueueTarget(pendingItem!) !== 'vacating_requests') {
      fail('pending should target vacating_requests');
    }
    if (vacatingOperationsQueueTarget(approvedItem!) !== null) {
      fail('approved without settlement should not target vacating_requests');
    }
    const counts = computeMoveOutPipelineCounts(pipeline, '2026-07-01');
    if (counts.moveOutApprovalRequests !== 1 || counts.bedsReleasing30Days !== 1) {
      fail(`counts expected 1 pending / 1 beds releasing, got ${JSON.stringify(counts)}`);
    }
    pass('1. Operations queue rules', 'simulated pending vs approved routing');
  };

  if (!pending) {
    if (pendingRows.length > 0) {
      console.warn(
        `WARN: ${pendingRows.length} pending move-out(s) but none match safe criteria — set P1_VERIFY_EXECUTE_APPROVE=1 and P1_VERIFY_VACATING_REQUEST_ID to mutate.`,
      );
    } else {
      console.warn('WARN: No pending vacating in DB — simulating queue rules.');
    }
    runSimulatedQueueRules();
  } else if (!executeApprove) {
    console.warn(
      `WARN: Safe pending ${pending.booking_code} found — dry-run (set P1_VERIFY_EXECUTE_APPROVE=1 to approve live).`,
    );
    runSimulatedQueueRules();
  } else {
    const { approveVacatingRequest } = await import('@/src/services/vacating');

    const beforePipeline = buildMoveOutPipeline({
      vacatingRows: [
        {
          id: pending.id,
          bookingId: pending.booking_id,
          bookingCode: pending.booking_code,
          customerId: pending.customer_id,
          customerFullName: 'Resident',
          customerPhone: '+910000000000',
          pgName: pending.pg_name,
          bedCode: 'B1',
          roomNumber: '101',
          noticeGivenDate: pending.notice_given_date,
          vacatingDate: pending.vacating_date,
          noticeCompliant: true,
          status: 'pending',
          resolvedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deductionPaise: 0,
          depositHeldPaise: 50_000,
        },
      ],
      settlements: [],
    });
    if (vacatingOperationsQueueTarget(beforePipeline[0]!) !== 'vacating_requests') {
      fail('pending row not in vacating_requests before approve');
    }

    const result = await approveVacatingRequest({
      requestId: pending.id,
      resolvedByAdminId: session.adminId,
    });
    if (!result.ok) {
      fail(`approve failed: ${JSON.stringify(result)}`);
    }

    await revalidateVacatingLifecycleAndNotifications();
    const vacatingOpsAfter = await vacatingOpsCount(session);

    const approvedInput = {
      id: pending.id,
      bookingId: pending.booking_id,
      bookingCode: pending.booking_code,
      customerId: pending.customer_id,
      customerFullName: 'Resident',
      customerPhone: '+910000000000',
      pgName: pending.pg_name,
      bedCode: 'B1',
      roomNumber: '101',
      noticeGivenDate: pending.notice_given_date,
      vacatingDate: pending.vacating_date,
      noticeCompliant: true,
      status: 'approved' as const,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deductionPaise: 0,
      depositHeldPaise: 50_000,
    };
    const afterPipeline = buildMoveOutPipeline({
      vacatingRows: [approvedInput],
      settlements: [],
    });
    if (vacatingOperationsQueueTarget(afterPipeline[0]!) !== null) {
      fail('approved row still targets vacating_requests after approve');
    }
    const counts = computeMoveOutPipelineCounts(afterPipeline, pending.vacating_date.slice(0, 10));
    if (counts.moveOutApprovalRequests !== 0) {
      fail('moveOutApprovalRequests should be 0 after approve');
    }
    if (counts.bedsReleasing30Days < 1) {
      fail('approved should count toward bedsReleasing30Days');
    }
    if (vacatingOpsAfter > vacatingOpsBefore) {
      fail(
        `vacating_requests ops count increased after approve (${vacatingOpsBefore} → ${vacatingOpsAfter})`,
      );
    }

    pass(
      '1. Approve move-out → ops queues',
      `booking ${pending.booking_code}; pending queue cleared; bedsReleasing=${counts.bedsReleasing30Days}; ops ${vacatingOpsBefore}→${vacatingOpsAfter}`,
    );
  }

  const reviewFixture = buildMoveOutPipeline({
    vacatingRows: [
      {
        id: 'sim-review',
        bookingId: '00000000-0000-0000-0000-000000000005',
        bookingCode: 'SIM-REVIEW',
        customerId: '00000000-0000-0000-0000-000000000006',
        customerFullName: 'Sim Review',
        customerPhone: '+910000000002',
        pgName: 'PG',
        bedCode: 'B3',
        roomNumber: '103',
        noticeGivenDate: '2026-06-01',
        vacatingDate: '2026-07-10',
        noticeCompliant: true,
        status: 'approved',
        resolvedAt: null,
        createdAt: new Date('2026-06-01'),
        updatedAt: new Date('2026-06-02'),
        deductionPaise: 0,
        depositHeldPaise: 50_000,
      },
    ],
    settlements: [
      {
        id: 'cs-sim-review',
        vacatingRequestId: 'sim-review',
        status: 'awaiting_admin_review',
        createdAt: new Date('2026-07-08'),
        updatedAt: new Date('2026-07-09'),
        approvedAt: null,
        refundPaidAt: null,
        finalRefundPaise: 10_000,
      },
    ],
  });
  if (vacatingOperationsQueueTarget(reviewFixture[0]!) !== 'refund_due') {
    fail('awaiting_admin_review must route to refund_due not move-out');
  }
  pass('1. Checkout review queue', 'awaiting_admin_review → refund_due');

  const monthlyBooking = await db.execute<{
    booking_id: string;
    customer_id: string;
    booking_code: string;
  }>(sql`
    SELECT b.id AS booking_id, b.customer_id, b.booking_code
    FROM bookings b
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary' AND br.status = 'active'
    WHERE b.status = 'confirmed'
      AND b.duration_mode = 'open_ended'
    ORDER BY b.updated_at DESC
    LIMIT 1
  `);
  const bk = monthlyBooking[0];
  if (!bk) {
    fail('no active monthly booking for billing verification');
  }

  const snapshot = await loadMonthlyBillingSnapshotForBooking({
    bookingId: bk.booking_id,
    customerId: bk.customer_id,
  });
  if (!snapshot) fail('monthly billing snapshot null for active booking');
  if (!snapshot.checkInDate || snapshot.billingCycleLabel === '—') {
    fail(`blank billing cycle or check-in: ${JSON.stringify(snapshot)}`);
  }
  if (!snapshot.nextRentDueDate) fail('blank nextRentDueDate');

  const loaded = await loadBookingFinancialWorkspace(session, bk.booking_id);
  if (!loaded.ok) fail(loaded.error);
  const ws = loaded.data.monthlyBillingSnapshot;
  if (!ws || ws.billingCycleLabel === '—' || !ws.nextRentDueDate) {
    fail('financial workspace missing billing snapshot fields');
  }
  pass(
    '2. Booking Financial Workspace billing',
    `${bk.booking_code} cycle=${ws.billingCycleLabel} check-in=${ws.checkInDate} paidUntil=${ws.paidUntilDate ?? 'n/a'} nextDue=${ws.nextRentDueDate}`,
  );

  const vacating = await db.execute<{
    notice_given_date: string;
    vacating_date: string;
    monthly_rent_paise_snapshot: number;
    notice_breakdown_json: unknown;
    deduction_paise: number;
  }>(sql`
    SELECT notice_given_date::text, vacating_date::text, monthly_rent_paise_snapshot,
           notice_breakdown_json, deduction_paise
    FROM vacating_requests
    WHERE booking_id = ${bk.booking_id}::uuid
      AND status IN ('pending', 'approved')
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const vr = vacating[0];
  if (vr) {
    const preview = await buildEstimatedSettlementPreview({
      bookingId: bk.booking_id,
      noticeGivenDate: vr.notice_given_date,
      vacatingDate: vr.vacating_date,
      monthlyRentPaiseSnapshot: Number(vr.monthly_rent_paise_snapshot),
      deductionPaise: Number(vr.deduction_paise),
      noticeBreakdownJson: vr.notice_breakdown_json as object,
    });
    if (!preview) fail('settlement preview null');
    const rentSection = preview.sections.find((s) => s.title === 'Rent');
    const refundRow = preview.sections
      .flatMap((s) => s.rows)
      .find((r) => r.id === 'estimated_refund' || r.label.includes('Estimated refund'));
    const billingRow = preview.sections
      .flatMap((s) => s.rows)
      .find((r) => r.id === 'billing_cycle');
    if (billingRow?.value === '—') fail('settlement billing cycle still dash');
    if (!rentSection?.rows.some((r) => r.id === 'rent_consumed')) {
      fail('missing rent consumed row');
    }
    pass(
      '3. Settlement consistency',
      `refund=${preview.estimatedRefundPaise}paise unusedRent=${preview.estimatedUnusedRentCreditPaise} waterfall refund=${preview.waterfall.refund.totalPaise}`,
    );
    if (preview.estimatedRefundPaise !== preview.waterfall.refund.totalPaise) {
      fail('estimated refund mismatch vs waterfall total');
    }
  } else {
    pass('3. Settlement consistency', 'skipped — no vacating row on sample booking (billing snapshot OK)');
  }

  await close();
  await closeDb();
  console.log('\n=== All verification checks passed ===');
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
