import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  electricityInvoiceToCollectionRow,
  rentInvoiceToCollectionRow,
} from '@/src/lib/admin/billingCollectionsPresentation';
import {
  filterBillingCollectionsByDate,
} from '@/src/lib/admin/billingCollectionsFilter';
import {
  electricityUseProRataFromRow,
  residentElectricityCalcExplanation,
  RESIDENT_ELECTRICITY_PRO_RATA_EXPLANATION,
} from '@/src/lib/residents/residentElectricityHistoryPresentation';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('electricityUseProRataFromRow reads calculation_breakdown flag', () => {
  assert.equal(
    electricityUseProRataFromRow({
      calculationBreakdown: { useProRata: true },
    } as never),
    true,
  );
  assert.equal(
    electricityUseProRataFromRow({
      calculationBreakdown: { useProRata: false },
    } as never),
    false,
  );
});

test('resident electricity calc explanation uses pro-rata copy when flagged', () => {
  const proRata = residentElectricityCalcExplanation({
    calculationBreakdown: { useProRata: true },
  } as never);
  assert.equal(proRata, RESIDENT_ELECTRICITY_PRO_RATA_EXPLANATION);
  assert.doesNotMatch(proRata, /equal/i);
});

test('billing collection rows include electricity metadata', () => {
  const row = electricityInvoiceToCollectionRow({
    id: 'inv-1',
    invoiceNumber: 'E-100',
    customerId: 'c1',
    customerFullName: 'Alex',
    customerPhone: '+919999999999',
    pgId: 'pg1',
    pgName: 'Test PG',
    roomNumber: '204',
    bedCode: 'B2',
    billingMonth: '2026-06-01',
    dueDate: '2026-06-10',
    amountPaise: 50_000,
    paidAt: new Date('2026-06-15T10:30:00Z'),
    paymentProvider: 'cash',
    paymentRawPayload: {
      source: 'admin_cash_settlement',
      receivedByAdminName: 'Operator',
    },
    effectiveStatus: 'paid',
    bookingId: 'b1',
  });
  assert.equal(row.kind, 'electricity');
  assert.equal(row.bedCode, 'B2');
  assert.equal(row.collectedBy, 'Operator');
  assert.equal(row.paymentMode, 'Cash');
});

test('filterBillingCollectionsByDate supports today filter in IST', () => {
  const rows = [
    rentInvoiceToCollectionRow({
      id: 'r1',
      invoiceNumber: 'R-1',
      bookingId: 'b1',
      bookingCode: 'BC',
      customerId: 'c1',
      customerFullName: 'Alex',
      customerPhone: '+919999999999',
      pgId: 'pg1',
      pgName: 'PG',
      bedId: 'bed1',
      bedCode: 'B1',
      roomNumber: '101',
      billingMonth: '2026-06-01',
      dueDate: '2026-06-05',
      rentPaise: 100_000,
      discountPaise: 0,
      paidPrincipalPaise: 100_000,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: null,
      status: 'paid',
      paidAt: new Date('2026-07-31T06:00:00Z'),
      createdAt: new Date(),
      notes: null,
      paymentProvider: 'upi_manual',
      paymentRawPayload: null,
      outstandingPaise: 0,
      effectiveStatus: 'paid',
    }),
  ];
  const filtered = filterBillingCollectionsByDate(rows, 'today', new Date('2026-07-31T12:00:00Z'));
  assert.equal(filtered.length, 1);
});

test('resident portal presentation avoids equal-split copy when pro-rata flagged', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/lib/residents/residentPortalPresentation.ts'),
    'utf8',
  );
  assert.match(source, /electricityUseProRata/);
  assert.match(source, /stay duration, occupancy during the billing cycle/);
});

test('ResidentPaymentsV2Hub mounts electricity history table', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/customer/account/resident/ResidentPaymentsV2Hub.tsx'),
    'utf8',
  );
  assert.match(source, /ResidentElectricityHistory/);
  assert.match(source, /electricityHistory/);
});
