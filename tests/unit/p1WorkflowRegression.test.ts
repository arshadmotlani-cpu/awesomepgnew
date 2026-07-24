import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import { computeMoveOutPipelineCounts } from '@/src/lib/moveOut/moveOutPipelineCounts';
import { vacatingOperationsQueueTarget } from '@/src/lib/operations/operationsQueueVacating';
import { billingCycleLabelFromDay } from '@/src/lib/billing/monthlyBillingSnapshot';
import { buildSettlementBillingDatesSectionRows } from '@/src/lib/vacating/settlementBillingRows';

test('approved without settlement is not in pending move-out ops queue', () => {
  const pipeline = buildMoveOutPipeline({
    vacatingRows: [
      {
        id: 'vr-1',
        bookingId: 'bk-1',
        bookingCode: 'APG-1',
        customerId: 'c-1',
        customerFullName: 'Resident',
        customerPhone: '+910000000000',
        pgName: 'PG',
        bedCode: 'B1',
        roomNumber: '101',
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
  assert.equal(vacatingOperationsQueueTarget(pipeline[0]!), null);
  const counts = computeMoveOutPipelineCounts(pipeline, '2026-07-01');
  assert.equal(counts.moveOutApprovalRequests, 0);
  assert.equal(counts.bedsReleasing30Days, 1);
});

test('billingCycleLabelFromDay formats anchor day', () => {
  assert.match(billingCycleLabelFromDay(5), /5th of each month/);
});

test('settlement billing rows use notice labels when present', () => {
  const rows = buildSettlementBillingDatesSectionRows({
    notice: {
      noticeRequiredDays: 30,
      noticeGivenDays: 45,
      missingNoticeDays: 0,
      billingDay: 5,
      billingCycleLabel: '5th of each month',
      paidUntilDate: '2026-07-04',
      vacatingDate: '2026-07-15',
      unusedPrepaidRentDays: 0,
      noticeCoveredByPrepaidRent: 0,
      chargeableNoticeDays: 0,
      noticeDeductionPaise: 0,
    },
    vacatingDate: '2026-07-15',
    stayDays: 30,
    checkInDate: '2026-06-01',
    checkoutDate: '2026-07-15',
  });
  const cycle = rows.find((r) => r.id === 'billing_cycle');
  assert.equal(cycle?.value, '5th of each month');
  const paidUntil = rows.find((r) => r.id === 'paid_until');
  assert.match(paidUntil?.value ?? '', /2026/);
});

test('revalidateVacatingLifecycleViews includes admin notifications path', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'src/lib/vacating/revalidateVacatingViews.ts'),
    'utf8',
  );
  assert.match(src, /\/admin\/notifications/);
});

test('approveVacatingAction awaits notification sync', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(process.cwd(), 'app/(admin)/admin/vacating/actions.ts'),
    'utf8',
  );
  assert.match(src, /revalidateVacatingLifecycleAndNotifications/);
});
