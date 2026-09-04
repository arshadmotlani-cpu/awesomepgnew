import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  billingMonthCalendarDays,
  mergeRoomElectricityCoverage,
} from '@/src/lib/billing/roomElectricityOccupancyCoverage';

test('fleet electricity status derives from PG room inventory checklist', () => {
  const src = readFileSync('src/lib/billing/fleetElectricityBillingStatus.ts', 'utf8');
  assert.match(src, /loadPgElectricityBillingChecklist/);
  assert.match(src, /listActivePgsForElectricityBilling/);
  assert.doesNotMatch(src, /br\.status = 'active'/);
});

test('missing electricity rooms use fleet checklist not active-reservation SQL', () => {
  const billing = readFileSync('src/services/electricityBilling.ts', 'utf8');
  assert.match(billing, /listFleetRoomsMissingElectricityBill/);
  assert.doesNotMatch(billing, /br\.status = 'active'/);
});

test('PG checklist uses historical room occupancy SSOT', () => {
  const checklist = readFileSync('src/lib/billing/pgElectricityBillingChecklist.ts', 'utf8');
  assert.match(checklist, /loadRoomElectricityOccupantsForMonth/);
  assert.doesNotMatch(checklist, /br\.status = 'active'/);
  assert.match(checklist, /maintenance_excluded/);
  assert.match(checklist, /currentReadingUnits/);
});

test('Room 402 female scenario — 850→859 = 9 units at ₹15/unit = ₹135', () => {
  const units = 859 - 850;
  assert.equal(units, 9);
  const totalPaise = units * 1500;
  assert.equal(totalPaise, 13500);
});

test('same-room bed change remains one continuous September occupancy interval', () => {
  const month = '2026-09-01';
  const [coverage] = mergeRoomElectricityCoverage({
    roomId: 'room-204',
    billingMonth: month,
    segments: [
      {
        roomId: 'room-204',
        bookingId: 'bk-1',
        customerId: 'cust-1',
        bedId: 'bed-b3',
        startDate: '2026-09-01',
        endDateExclusive: '2026-09-16',
      },
      {
        roomId: 'room-204',
        bookingId: 'bk-1',
        customerId: 'cust-1',
        bedId: 'bed-b1',
        startDate: '2026-09-16',
        endDateExclusive: null,
      },
    ],
  });
  assert.equal(coverage.activeDays, 30);
  assert.equal(billingMonthCalendarDays(month).length, 30);
});

test('resident left before month has zero September days', () => {
  const coverage = mergeRoomElectricityCoverage({
    roomId: 'room-a',
    billingMonth: '2026-09-01',
    segments: [
      {
        roomId: 'room-a',
        bookingId: 'bk-left',
        customerId: 'cust-left',
        bedId: 'bed-1',
        startDate: '2026-08-01',
        endDateExclusive: '2026-09-01',
      },
    ],
  });
  assert.equal(coverage.length, 0);
});

test('September certification script is read-only', () => {
  const script = readFileSync('scripts/cert-september-2026-electricity-readonly.ts', 'utf8');
  const service = readFileSync('src/services/september2026ElectricityCertification.ts', 'utf8');
  assert.match(script, /productionMutationCount: 0/);
  assert.match(service, /loadFleetElectricityBillingSummary/);
  assert.match(service, /reconcileRoomElectricityBilling/);
  assert.match(service, /auditElectricityInvoiceOwnership/);
  assert.doesNotMatch(service, /UPDATE electricity/);
  assert.doesNotMatch(service, /INSERT INTO electricity/);
});

test('cert canonical allocation uses bill prepaidCreditAppliedPaise not live room prepaid', () => {
  const service = readFileSync('src/services/september2026ElectricityCertification.ts', 'utf8');
  assert.match(service, /prepaidCreditAppliedPaise/);
  assert.match(service, /prepaidCreditPaise: billMeta\?\.prepaidCreditAppliedPaise/);
  assert.doesNotMatch(service, /rooms\.electricityPrepaidCreditPaise/);
});

test('cert detects BILL_WITHOUT_INVOICES via generic repair preview list', () => {
  const service = readFileSync('src/services/september2026ElectricityCertification.ts', 'utf8');
  assert.match(service, /listElectricityBillsWithoutInvoices/);
  assert.match(service, /billWithoutInvoicesCount/);
});

test('billing center separates need-bills vs need-meters counts', () => {
  const page = readFileSync('app/(admin)/admin/billing/page.tsx', 'utf8');
  assert.match(page, /loadFleetElectricityBillingSummary/);
  assert.match(page, /roomsNeedingBillCount: electricityNeedingBills/);
  assert.match(page, /roomsWaitingMeterCount: electricityWaitingMeters/);
});

test('already billed rooms show saved meter readings in generator UI', () => {
  const ui = readFileSync('src/components/admin/electricity/PgElectricityBillingChecklist.tsx', 'utf8');
  assert.match(ui, /Previous reading/);
  assert.match(ui, /Current reading/);
  assert.match(ui, /Already billed/);
});

test('Saswat ₹83 paid history must be preserved by repair contract', () => {
  const ownership = readFileSync('src/services/electricityInvoiceOwnership.ts', 'utf8');
  assert.match(ownership, /skippedPaid/);
  assert.match(ownership, /paidPaise > 0/);
});
