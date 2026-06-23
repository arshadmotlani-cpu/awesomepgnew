import { strict as assert } from 'node:assert';
import test from 'node:test';
import { diffDays, tryDiffDays } from '../../src/lib/dates';
import {
  buildMoveOutPipeline,
  toClientMoveOutPipelineItem,
} from '../../src/lib/moveOut/moveOutPipeline';
import { toMoveOutAdvancedToolsRow } from '../../src/lib/moveOut/moveOutAdvancedToolsProps';
import { moveOutDaysRemaining } from '../../src/lib/vacating/approvalPreview';
import { estimateVacateDepositPreview } from '../../src/lib/vacating/depositRefundEligibility';

const baseVacatingRow = {
  id: 'vr-1',
  bookingId: 'bk-1',
  bookingCode: 'PG26-001',
  customerId: 'cust-1',
  customerFullName: 'Test Resident',
  customerPhone: '+919876543210',
  pgName: 'Demo PG',
  bedCode: 'A1',
  roomNumber: '101',
  noticeGivenDate: '2026-06-01',
  vacatingDate: '2026-06-20',
  noticeCompliant: true,
  status: 'pending' as const,
  resolvedAt: null,
  createdAt: new Date('2026-06-01T10:00:00.000Z'),
  updatedAt: new Date('2026-06-02T10:00:00.000Z'),
  deductionPaise: 0,
  depositRefundPaise: 0,
  monthlyRentPaiseSnapshot: 1200000,
  depositHeldPaise: 500000,
};

test('toClientMoveOutPipelineItem serializes Date fields to ISO strings', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [baseVacatingRow],
    settlements: [],
  });
  assert.ok(item);

  const client = toClientMoveOutPipelineItem(item);
  assert.equal(typeof client.createdAt, 'string');
  assert.equal(typeof client.updatedAt, 'string');
  assert.equal(client.resolvedAt, null);
  assert.equal(client.stageTimestamps.requested, baseVacatingRow.createdAt.toISOString());
});

test('toMoveOutAdvancedToolsRow strips Date instances for client boundary', () => {
  const row = toMoveOutAdvancedToolsRow(
    {
      ...baseVacatingRow,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 1200000,
    },
    500000,
  );

  assert.equal(typeof row.createdAt, 'string');
  assert.equal(typeof row.updatedAt, 'string');
  assert.equal(row.resolvedAt, null);
  assert.ok(row.approvalPreview);
  assert.equal(row.approvalPreview?.moveOutDate, '2026-06-20');
});

test('moveOutDaysRemaining returns 0 for invalid vacating dates instead of throwing', () => {
  assert.equal(moveOutDaysRemaining('', '2026-06-01'), 0);
  assert.equal(moveOutDaysRemaining('not-a-date', '2026-06-01'), 0);
});

test('tryDiffDays guards invalid calendar input', () => {
  assert.equal(tryDiffDays('', '2026-06-02'), null);
  assert.equal(tryDiffDays('2026-06-01', undefined), null);
  assert.equal(tryDiffDays('2026-06-01', '2026-06-11'), diffDays('2026-06-01', '2026-06-11'));
});

test('estimateVacateDepositPreview handles empty vacating date without throwing', () => {
  const preview = estimateVacateDepositPreview({
    depositHeldPaise: 100000,
    monthlyRentPaise: 1200000,
    vacatingDate: '',
  });
  assert.equal(preview.earlyVacate, false);
  assert.equal(preview.estimatedRefundablePaise, 100000);
});

test('buildMoveOutPipeline uses settlement electricity and locked final refund', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      {
        ...baseVacatingRow,
        status: 'completed',
        deductionPaise: 59500,
        depositHeldPaise: 150000,
      },
    ],
    settlements: [
      {
        id: 'cs-1',
        vacatingRequestId: 'vr-1',
        status: 'completed',
        createdAt: new Date('2026-06-15T10:00:00.000Z'),
        updatedAt: new Date('2026-06-18T10:00:00.000Z'),
        approvedAt: new Date('2026-06-18T10:00:00.000Z'),
        refundPaidAt: new Date('2026-06-18T10:00:00.000Z'),
        noticeDeductionPaise: 59500,
        electricitySharePaise: 90500,
        electricityDeductFromDeposit: true,
        finalRefundPaise: 0,
        amountsLocked: true,
      },
    ],
  });
  assert.ok(item);
  assert.equal(item.estimatedRefundPaise, 0);
  assert.equal(item.continueKind, 'view');
});
