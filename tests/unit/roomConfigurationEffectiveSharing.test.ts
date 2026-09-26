import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveFinancialSharingBedCount,
  scheduleAppliesToFinancialDate,
} from '@/src/lib/roomConfiguration/effectiveSharingCapacity';

const OCT1 = '2026-10-01';
const SEP30 = '2026-09-30';
const schedule3to2 = {
  effectiveFrom: OCT1,
  targetBedCount: 2,
  status: 'scheduled' as const,
};

test('3 sharing → 2 from Oct 1: before Oct 1 financial divisor stays 3', () => {
  assert.equal(
    resolveFinancialSharingBedCount({
      physicalBedCount: 3,
      schedule: schedule3to2,
      asOfDate: SEP30,
    }),
    3,
  );
  assert.equal(
    resolveFinancialSharingBedCount({
      physicalBedCount: 3,
      schedule: schedule3to2,
      asOfDate: '2026-09-01',
    }),
    3,
  );
});

test('3 sharing → 2 from Oct 1: on/after Oct 1 uses scheduled 2', () => {
  assert.equal(
    resolveFinancialSharingBedCount({
      physicalBedCount: 3,
      schedule: schedule3to2,
      asOfDate: OCT1,
    }),
    2,
  );
  assert.equal(
    resolveFinancialSharingBedCount({
      physicalBedCount: 3,
      schedule: { ...schedule3to2, status: 'applied' },
      asOfDate: '2026-11-15',
    }),
    2,
  );
});

test('historical dates before schedule never see future target count', () => {
  assert.equal(
    scheduleAppliesToFinancialDate(schedule3to2, '2026-06-01'),
    false,
  );
  assert.equal(
    resolveFinancialSharingBedCount({
      physicalBedCount: 3,
      schedule: schedule3to2,
      asOfDate: '2026-06-01',
    }),
    3,
  );
});

test('checkout and billing overview wire configuration-effective asOfDate', () => {
  const checkout = readFileSync(
    join(process.cwd(), 'src/services/checkoutSettlement.ts'),
    'utf8',
  );
  const rent = readFileSync(join(process.cwd(), 'src/services/rentInvoices.ts'), 'utf8');
  const electricitySettlement = readFileSync(
    join(process.cwd(), 'src/lib/checkout/electricitySettlement.ts'),
    'utf8',
  );
  assert.match(checkout, /resolveRoomOccupancyContext\(row\.booking_id,\s*\{\s*asOfDate: firstOfMonth\(row\.vacating_date\)/);
  assert.match(checkout, /resolveRoomOccupancyContext\(current\.bookingId,\s*\{\s*asOfDate: electricityAsOf/);
  assert.match(rent, /resolveRoomOccupancyContext\(c\.bookingId, \{ asOfDate: month \}\)/);
  assert.match(electricitySettlement, /resolveEffectiveBedCountForRoom\(roomId, asOfDate\)/);
});

test('electricity repair/cert paths use effective bed count for billing month', () => {
  const files = [
    'src/services/repairElectricityBillAllocation.ts',
    'src/services/repairElectricityBillMissingInvoices.ts',
    'src/services/september2026ElectricityCertification.ts',
    'src/lib/billing/pgElectricityBillingChecklist.ts',
  ];
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.match(
      src,
      /resolveEffectiveBedCountForRoom/,
      `${rel} must use date-aware bed count`,
    );
  }
});
