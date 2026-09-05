import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { isElectricityCoveredByPriorCollection } from '@/src/lib/billing/electricityCollectibility';
import { remainingElectricityAfterCollections } from '@/src/lib/billing/pgElectricityGenerationPreviewPure';
import { roomMonthCollectionKey } from '@/src/lib/billing/electricityPriorCollection';
import { buildResidentBillRowsFromDetail } from '@/src/lib/residents/residentPortalBillRows';

test('prior collection covers invoice — resident not payable', () => {
  assert.equal(
    isElectricityCoveredByPriorCollection({
      invoiceAmountPaise: 20_000,
      priorCollectionPaise: 20_000,
    }),
    true,
  );
  assert.equal(
    isElectricityCoveredByPriorCollection({
      invoiceAmountPaise: 20_000,
      priorCollectionPaise: 25_000,
    }),
    true,
  );
  assert.equal(
    isElectricityCoveredByPriorCollection({
      invoiceAmountPaise: 20_000,
      priorCollectionPaise: 5_000,
    }),
    false,
  );
});

test('remaining electricity subtracts previously collected from gross', () => {
  assert.equal(remainingElectricityAfterCollections(144_000, 20_000), 124_000);
  assert.equal(remainingElectricityAfterCollections(20_000, 25_000), 0);
});

test('room month collection key normalizes billing month', () => {
  assert.equal(roomMonthCollectionKey('room-1', '2026-08-15'), 'room-1:2026-08-01');
});

test('portal bill rows skip electricity covered by prior checkout collection', () => {
  const roomId = 'room-abc';
  const billingMonth = '2026-08-01';
  const key = roomMonthCollectionKey(roomId, billingMonth);
  const result = buildResidentBillRowsFromDetail(
    [
      {
        bookingId: 'booking-1',
        rent: { ok: true, data: [] },
        electricity: {
          ok: true,
          data: [
            {
              id: 'elec-1',
              invoiceNumber: 'E-1',
              electricityBillId: 'bill-1',
              roomId,
              bookingId: 'booking-1',
              billingMonth,
              dueDate: '2026-09-04',
              amountPaise: 20_000,
              paidPaise: 0,
              lateFeeLockedPaise: 0,
              status: 'pending',
              paymentId: null,
              paidAt: null,
              paymentProofUrl: null,
              unitsShare: null,
              activeDays: 10,
              createdAt: new Date('2026-09-01'),
              updatedAt: new Date('2026-09-01'),
              lateFeeWaived: false,
            },
          ],
        },
      },
    ],
    {
      electricityPriorCollectionByBooking: new Map([
        ['booking-1', new Map([[key, 20_000]])],
      ]),
    },
  );
  assert.equal(result.dueBillRows.length, 0);
});

test('checkout approval is fail-closed when electricity collection cannot be recorded', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/checkoutSettlement.ts'),
    'utf8',
  );
  assert.match(src, /if \(resolvedSharePaise > 0\)/);
  assert.match(src, /Checkout electricity collection could not be recorded/);
  assert.match(src, /return \{\s*ok: false/);
});

test('checkout occupant loader delegates to historical SSOT', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/services/roomElectricityCheckout.ts'),
    'utf8',
  );
  assert.match(src, /loadHistoricalRoomOccupantSlicesForPeriod/);
  assert.doesNotMatch(src, /bed_reservations\.status = 'active'/);
});
