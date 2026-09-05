import assert from 'node:assert/strict';
import { test } from 'node:test';

// Mirrors merge logic in loadRoomElectricityContributionsForMonth

test('contributions merge dedupes checkout settlement ids', () => {
  type Row = {
    id: string;
    customerId: string;
    amountPaise: number;
    contributionDate: string;
    checkoutSettlementId: string | null;
    kind: 'checkout_recovery';
    roomId: string;
    billingMonth: string;
    customerName: string;
    bookingId: string;
    reason: string | null;
    occupancyStart: null;
    occupancyEnd: null;
    createdByAdminId: null;
    createdAt: Date;
  };

  const tableRows: Row[] = [
    {
      id: 't1',
      roomId: 'r1',
      billingMonth: '2026-08-01',
      customerId: 'c1',
      customerName: 'A',
      bookingId: 'b1',
      amountPaise: 20_000,
      kind: 'checkout_recovery',
      reason: null,
      contributionDate: '2026-08-20',
      occupancyStart: null,
      occupancyEnd: null,
      checkoutSettlementId: 'cs-1',
      createdByAdminId: null,
      createdAt: new Date(),
    },
  ];
  const legacyRows: Row[] = [
    {
      id: 'legacy-1',
      roomId: 'r1',
      billingMonth: '2026-08-01',
      customerId: 'c1',
      customerName: 'A',
      bookingId: 'b1',
      amountPaise: 20_000,
      kind: 'checkout_recovery',
      reason: 'legacy',
      contributionDate: '2026-08-20',
      occupancyStart: null,
      occupancyEnd: null,
      checkoutSettlementId: 'cs-1',
      createdByAdminId: null,
      createdAt: new Date(),
    },
    {
      id: 'legacy-2',
      roomId: 'r1',
      billingMonth: '2026-08-01',
      customerId: 'c2',
      customerName: 'B',
      bookingId: 'b2',
      amountPaise: 5_000,
      kind: 'checkout_recovery',
      reason: 'legacy',
      contributionDate: '2026-08-22',
      occupancyStart: null,
      occupancyEnd: null,
      checkoutSettlementId: null,
      createdByAdminId: null,
      createdAt: new Date(),
    },
  ];

  const seenSettlementIds = new Set(
    tableRows.map((r) => r.checkoutSettlementId).filter(Boolean) as string[],
  );
  const merged = [...tableRows];
  for (const legacy of legacyRows) {
    if (legacy.checkoutSettlementId && seenSettlementIds.has(legacy.checkoutSettlementId)) {
      continue;
    }
    merged.push(legacy);
    if (legacy.checkoutSettlementId) seenSettlementIds.add(legacy.checkoutSettlementId);
  }

  assert.equal(merged.length, 2);
  assert.equal(merged.filter((r) => r.customerId === 'c1').length, 1);
  assert.equal(merged.find((r) => r.customerId === 'c2')?.amountPaise, 5_000);
});
