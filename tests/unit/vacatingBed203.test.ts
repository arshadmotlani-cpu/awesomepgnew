import { strict as assert } from 'node:assert';
import test from 'node:test';
import { normalizeIsoDateOnly, tryDiffDays } from '../../src/lib/dates';
import { buildVacatingApprovalPreview } from '../../src/lib/vacating/approvalPreview';
import { toMoveOutAdvancedToolsRow } from '../../src/lib/moveOut/moveOutAdvancedToolsProps';

test('normalizeIsoDateOnly strips timestamps to calendar dates', () => {
  assert.equal(normalizeIsoDateOnly('2026-06-15T00:00:00.000Z'), '2026-06-15');
  assert.equal(normalizeIsoDateOnly('2026-06-15'), '2026-06-15');
  assert.equal(normalizeIsoDateOnly(''), '');
});

test('buildVacatingApprovalPreview tolerates ISO timestamp dates', () => {
  const preview = buildVacatingApprovalPreview(
    {
      id: 'vr-1',
      bookingId: 'bk-1',
      bookingCode: 'PG26-001',
      customerId: 'c-1',
      customerFullName: 'Resident',
      customerPhone: '+919876543210',
      pgName: 'Shanti Nagar',
      bedCode: 'B5',
      roomNumber: '203',
      noticeGivenDate: '2026-06-01T00:00:00.000Z',
      vacatingDate: '2026-06-20T00:00:00.000Z',
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 500000,
      status: 'pending',
      resolvedAt: null,
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-02T10:00:00.000Z'),
    },
    400000,
  );

  assert.equal(preview.moveOutDate, '2026-06-20');
  assert.equal(preview.noticeSubmittedDate, '2026-06-01');
  assert.equal(preview.noticeCompletedDays, tryDiffDays('2026-06-01', '2026-06-20'));
});

test('toMoveOutAdvancedToolsRow coerces bigint paise fields', () => {
  const row = toMoveOutAdvancedToolsRow(
    {
      id: 'vr-1',
      bookingId: 'bk-1',
      bookingCode: 'PG26-001',
      customerId: 'c-1',
      customerFullName: 'Resident',
      customerPhone: '+919876543210',
      pgName: 'Shanti Nagar',
      bedCode: 'B5',
      roomNumber: '203',
      noticeGivenDate: '2026-06-01',
      vacatingDate: '2026-06-20',
      noticeCompliant: true,
      deductionPaise: 100n as unknown as number,
      depositRefundPaise: 200n as unknown as number,
      monthlyRentPaiseSnapshot: 500000n as unknown as number,
      status: 'pending',
      resolvedAt: null,
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-02T10:00:00.000Z'),
    },
    400000,
  );

  assert.equal(typeof row.deductionPaise, 'number');
  assert.equal(row.deductionPaise, 100);
  assert.doesNotThrow(() => JSON.stringify(row));
});
