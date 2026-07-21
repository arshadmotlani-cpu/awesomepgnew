import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookingFinancialWorkspaceHref,
  bookingFinancialWorkspaceSectionHref,
} from '@/src/lib/bookings/bookingFinancialLinks';
import { depositExpressHref } from '@/src/lib/deposits/depositExpressLinks';
import { buildMoveOutPipeline } from '@/src/lib/moveOut/moveOutPipeline';
import { mapVacatingPipelineItemToOpsItem } from '@/src/lib/operations/operationsQueueVacating';

test('bookingFinancialWorkspaceHref is canonical admin financial route', () => {
  assert.equal(
    bookingFinancialWorkspaceHref('bk-1'),
    '/admin/bookings/bk-1/financial',
  );
  assert.equal(
    bookingFinancialWorkspaceSectionHref('bk-1', 'checkout'),
    '/admin/bookings/bk-1/financial#checkout',
  );
});

test('depositExpressHref routes to financial workspace when booking is known', () => {
  assert.equal(depositExpressHref('bk-1'), '/admin/bookings/bk-1/financial');
});

test('pending move-out pipeline links to financial workspace move-out section', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      {
        id: 'vr-1',
        bookingId: 'bk-1',
        bookingCode: 'PG26-001',
        customerId: 'cust-1',
        customerFullName: 'Resident',
        customerPhone: '+910000000000',
        pgName: 'Demo PG',
        bedCode: 'A1',
        roomNumber: '101',
        noticeGivenDate: '2026-06-01',
        vacatingDate: '2026-06-20',
        noticeCompliant: true,
        status: 'pending',
        resolvedAt: null,
        createdAt: new Date('2026-06-01'),
        updatedAt: new Date('2026-06-02'),
        deductionPaise: 0,
        depositRefundPaise: 0,
        monthlyRentPaiseSnapshot: 1200000,
        depositHeldPaise: 500000,
      },
    ],
    settlements: [],
  });
  assert.ok(item);
  assert.equal(item.continueHref, '/admin/bookings/bk-1/financial#move-out');
});

test('operations vacating queue uses financial workspace links', () => {
  const ops = mapVacatingPipelineItemToOpsItem(
    {
      id: 'vr-1',
      vacatingRequestId: 'vr-1',
      bookingId: 'bk-1',
      bookingCode: 'PG26-001',
      customerId: 'cust-1',
      customerFullName: 'Resident',
      customerPhone: '+910000000000',
      pgName: 'Demo PG',
      bedCode: 'A1',
      roomNumber: '101',
      vacatingDate: '2026-06-20',
      noticeGivenDate: '2026-06-01',
      noticeCompliant: true,
      vacatingStatus: 'pending',
      settlementId: null,
      settlementStatus: null,
      stage: 'requested',
      stageIndex: 0,
      stageLabel: 'Requested',
      nextAction: 'Approve',
      continueHref: '/admin/bookings/bk-1/financial#move-out',
      continueKind: 'approve',
      sortPriority: 0,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deductionPaise: 0,
      electricityDeductionPaise: 0,
      depositHeldPaise: 500000,
      estimatedRefundPaise: 500000,
      daysRemaining: 5,
      urgency: 'normal',
      bedStatus: 'Occupied',
      stageTimestamps: {},
    },
    'pg-1',
  );
  assert.ok(ops);
  assert.equal(ops.openHref, '/admin/bookings/bk-1/financial#move-out');
  assert.equal(ops.openLabel, 'Review finances');
});
