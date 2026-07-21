import { strict as assert } from 'node:assert';
import test from 'node:test';
import { normalizeIsoDateOnly, toIsoTimestampSafe, tryDiffDays } from '../../src/lib/dates';
import { buildVacatingApprovalPreview } from '../../src/lib/vacating/approvalPreview';
import { toMoveOutAdvancedToolsRow } from '../../src/lib/moveOut/moveOutAdvancedToolsProps';
import {
  buildMoveOutPipeline,
  toClientMoveOutPipelineItem,
} from '../../src/lib/moveOut/moveOutPipeline';

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
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 0,
      durationMode: 'monthly',
      stayType: 'monthly',
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
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 0,
      durationMode: 'monthly',
      stayType: 'monthly',
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

test('toIsoTimestampSafe handles strings and invalid dates without throwing', () => {
  assert.equal(toIsoTimestampSafe('2026-06-01T10:00:00.000Z'), '2026-06-01T10:00:00.000Z');
  assert.equal(toIsoTimestampSafe(new Date('invalid')), null);
  assert.equal(toIsoTimestampSafe('not-a-date'), null);
});

test('buildMoveOutPipeline tolerates bigint paise from postgres driver', () => {
  const [item] = buildMoveOutPipeline({
    vacatingRows: [
      {
        id: 'vr-1',
        bookingId: 'bk-1',
        bookingCode: 'APG-2026-0016',
        customerId: 'c-1',
        customerFullName: 'Harish',
        customerPhone: '+916369363982',
        pgName: 'Shanti Nagar',
        bedCode: 'B5',
        roomNumber: '203',
        noticeGivenDate: '2026-06-01',
        vacatingDate: '2026-06-20',
        noticeCompliant: true,
        status: 'approved',
        resolvedAt: null,
        createdAt: new Date('2026-06-01T10:00:00.000Z'),
        updatedAt: new Date('2026-06-02T10:00:00.000Z'),
        deductionPaise: 0n as unknown as number,
        depositHeldPaise: 400000n as unknown as number,
      },
    ],
    settlements: [],
  });
  assert.equal(item.estimatedRefundPaise, 400000);
  assert.doesNotThrow(() => JSON.stringify(toClientMoveOutPipelineItem(item)));
});

test('buildMoveOutPipeline tolerates ISO string createdAt when sorting pipeline', () => {
  const items = buildMoveOutPipeline({
    vacatingRows: [
      {
        id: 'vr-1',
        bookingId: 'bk-1',
        bookingCode: 'APG-2026-0016',
        customerId: 'c-1',
        customerFullName: 'Harish',
        customerPhone: '+916369363982',
        pgName: 'Shanti Nagar',
        bedCode: 'B5',
        roomNumber: '203',
        noticeGivenDate: '2026-06-01',
        vacatingDate: '2026-06-25',
        noticeCompliant: true,
        status: 'approved',
        resolvedAt: null,
        createdAt: '2026-06-01T10:00:00.000Z' as unknown as Date,
        updatedAt: '2026-06-02T10:00:00.000Z' as unknown as Date,
        deductionPaise: 0,
        depositHeldPaise: 400000,
      },
      {
        id: 'vr-2',
        bookingId: 'bk-2',
        bookingCode: 'APG-2026-0017',
        customerId: 'c-2',
        customerFullName: 'Priya',
        customerPhone: '+919876543210',
        pgName: 'Shanti Nagar',
        bedCode: 'B6',
        roomNumber: '204',
        noticeGivenDate: '2026-06-02',
        vacatingDate: '2026-06-20',
        noticeCompliant: true,
        status: 'pending',
        resolvedAt: null,
        createdAt: '2026-06-02T08:00:00.000Z' as unknown as Date,
        updatedAt: '2026-06-02T09:00:00.000Z' as unknown as Date,
        deductionPaise: 0,
        depositHeldPaise: 300000,
      },
    ],
    settlements: [],
  });

  assert.equal(items.length, 2);
  assert.doesNotThrow(() => JSON.stringify(items.map(toClientMoveOutPipelineItem)));
});

test('toMoveOutAdvancedToolsRow accepts ISO string timestamps from raw SQL', () => {
  const row = toMoveOutAdvancedToolsRow(
    {
      id: 'vr-1',
      bookingId: 'bk-1',
      bookingCode: 'APG-2026-0016',
      customerId: 'c-1',
      customerFullName: 'Harish',
      customerPhone: '+916369363982',
      pgName: 'Shanti Nagar',
      bedCode: 'B5',
      roomNumber: '203',
      noticeGivenDate: '2026-06-01T00:00:00.000Z',
      vacatingDate: '2026-06-20T00:00:00.000Z',
      noticeCompliant: true,
      deductionPaise: 0,
      depositRefundPaise: 0,
      monthlyRentPaiseSnapshot: 500000,
      noticeRentCoveredDays: 0,
      noticeChargeableDays: 0,
      durationMode: 'monthly',
      stayType: 'monthly',
      status: 'pending',
      resolvedAt: null,
      createdAt: '2026-06-01T10:00:00.000Z' as unknown as Date,
      updatedAt: '2026-06-02T10:00:00.000Z' as unknown as Date,
    },
    400000,
  );
  assert.equal(row.createdAt, '2026-06-01T10:00:00.000Z');
  assert.doesNotThrow(() => JSON.stringify(row));
});
