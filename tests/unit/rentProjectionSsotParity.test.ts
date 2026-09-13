/**
 * Cross-surface rent projection SSOT — Operations, invoice detail, cash settlement
 * must agree on outstanding when lateFeeBasePaise differs from rentPaise (proration).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRentInvoiceProjectInput } from '@/src/lib/billing/rentInvoiceProjectInput';
import { rentRowToQueueItem } from '@/src/lib/billing/collectionsQueue';
import { projectInvoice } from '@/src/services/rentInvoices';
import { projectAdminRentInvoiceRow } from '@/src/services/residentFinancialEngine';
import type { RentInvoice } from '@/src/db/schema';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';

const PRORATED_RENT_PAISE = 412_080;
const LATE_FEE_BASE_PAISE = 212_686;
const PAID_PRINCIPAL = 402_110;
const PAID_LATE = 24_858;

function stubProratedInvoice(
  over: Partial<RentInvoice> = {},
): RentInvoice {
  return {
    id: 'inv-prorated-1',
    invoiceNumber: 'RNT-2026-09-0011',
    bookingId: 'bk-1',
    customerId: 'c-1',
    bedId: 'bed-1',
    pgId: 'pg-1',
    billingMonth: '2026-09-01',
    dueDate: '2026-09-05',
    rentPaise: PRORATED_RENT_PAISE,
    lateFeeBasePaise: LATE_FEE_BASE_PAISE,
    discountPaise: 0,
    promoCode: null,
    paidPrincipalPaise: PAID_PRINCIPAL,
    paidLateFeePaise: PAID_LATE,
    lateFeeLockedPaise: null,
    paymentProofUrl: null,
    paymentProofTransactionRef: null,
    proofSubmittedAt: null,
    proofSnapshotOutstandingPaise: null,
    proofSnapshotLateFeePaise: null,
    proofSnapshotPrincipalDuePaise: null,
    status: 'overdue',
    paidAt: null,
    paymentId: null,
    notes: null,
    cancelledAt: null,
    cancellationReason: null,
    isAdhoc: false,
    invoiceSubtype: 'standard',
    possibleDuplicate: false,
    duplicateOfIds: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...over,
  };
}

function adminRowFromInvoice(inv: RentInvoice): AdminRentInvoiceRow {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    bookingId: inv.bookingId,
    bookingCode: 'APG-2026-0099',
    customerId: inv.customerId,
    customerFullName: 'Test Resident',
    customerPhone: '9000000000',
    pgId: inv.pgId,
    pgName: 'Test PG',
    bedId: inv.bedId,
    bedCode: 'B2',
    roomNumber: '204',
    billingMonth: inv.billingMonth,
    dueDate: inv.dueDate,
    rentPaise: inv.rentPaise,
    lateFeeBasePaise: inv.lateFeeBasePaise,
    discountPaise: inv.discountPaise,
    paidPrincipalPaise: inv.paidPrincipalPaise,
    paidLateFeePaise: inv.paidLateFeePaise,
    lateFeeLockedPaise: inv.lateFeeLockedPaise,
    status: inv.status,
    paidAt: inv.paidAt,
    paymentId: inv.paymentId,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    notes: inv.notes,
    paymentProvider: null,
    paymentRawPayload: null,
    paymentProofUrl: inv.paymentProofUrl,
    proofSubmittedAt: inv.proofSubmittedAt,
    proofSnapshotOutstandingPaise: inv.proofSnapshotOutstandingPaise,
    proofSnapshotLateFeePaise: inv.proofSnapshotLateFeePaise,
    proofSnapshotPrincipalDuePaise: inv.proofSnapshotPrincipalDuePaise,
    cancelledAt: inv.cancelledAt,
    cancellationReason: inv.cancellationReason,
    isAdhoc: inv.isAdhoc,
    invoiceSubtype: inv.invoiceSubtype,
    outstandingPaise: 0,
    effectiveStatus: inv.status,
  };
}

test('prorated lateFeeBasePaise: canonical outstanding is zero when fully paid', () => {
  const inv = stubProratedInvoice({
    updatedAt: new Date('2026-09-10T12:00:00.000Z'),
  });
  const projected = projectInvoice(buildRentInvoiceProjectInput(inv));
  assert.equal(projected.outstandingPaise, 0, 'fully paid prorated invoice must show ₹0');
});

test('dropping lateFeeBasePaise inflates outstanding (regression guard)', () => {
  const inv = stubProratedInvoice({
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    status: 'overdue',
  });
  const canonical = projectInvoice(buildRentInvoiceProjectInput(inv));
  const broken = projectInvoice(
    buildRentInvoiceProjectInput({ ...inv, lateFeeBasePaise: 0 }),
  );
  assert.ok(canonical.outstandingPaise > inv.rentPaise);
  assert.ok(
    broken.outstandingPaise > canonical.outstandingPaise,
    'missing lateFeeBasePaise must inflate outstanding vs canonical SSOT',
  );
});

test('post-payment late fee does not accrue on calendar days after last payment update', () => {
  const inv = stubProratedInvoice({
    updatedAt: new Date('2026-09-10T12:00:00.000Z'),
  });
  const frozen = projectInvoice(buildRentInvoiceProjectInput(inv));
  assert.equal(frozen.outstandingPaise, 0, 'economically settled invoice must not show phantom due');

  const liveDrift = projectInvoice(buildRentInvoiceProjectInput(inv), new Date('2026-12-31'));
  assert.equal(
    liveDrift.outstandingPaise,
    0,
    'asOf later than payment freeze must not re-open balance',
  );
});

test('Operations admin projection matches invoice detail projection', () => {
  const inv = stubProratedInvoice();
  const row = adminRowFromInvoice(inv);
  const adminProjected = projectAdminRentInvoiceRow(row);
  const detailProjected = projectInvoice(buildRentInvoiceProjectInput(inv));

  assert.equal(adminProjected.outstandingPaise, detailProjected.outstandingPaise);
  assert.equal(adminProjected.accruedLateFeePaise, detailProjected.accruedLateFeePaise);
});

test('stale overdue status with zero canonical outstanding excluded from Operations queue', () => {
  const inv = stubProratedInvoice({ status: 'overdue' });
  const row = adminRowFromInvoice(inv);
  const projected = projectAdminRentInvoiceRow(row);
  row.outstandingPaise = projected.outstandingPaise;
  row.effectiveStatus = projected.effectiveStatus;

  assert.equal(row.outstandingPaise, 0);
  assert.equal(row.status, 'overdue', 'raw DB status may remain stale');

  const filtered = row.outstandingPaise > 0 ? [row] : [];
  assert.equal(filtered.length, 0, 'open rent list must filter zero outstanding');

  const queueItem = rentRowToQueueItem(row, '2026-09-11');
  assert.equal(queueItem, null, 'collections queue must not include zero-outstanding invoice');
});

test('partial payment: all surfaces agree on remaining balance', () => {
  const inv = stubProratedInvoice({
    paidPrincipalPaise: 200_000,
    paidLateFeePaise: 0,
    status: 'overdue',
  });
  const row = adminRowFromInvoice(inv);
  const admin = projectAdminRentInvoiceRow(row);
  const detail = projectInvoice(buildRentInvoiceProjectInput(inv));

  assert.equal(admin.outstandingPaise, detail.outstandingPaise);
  assert.ok(admin.outstandingPaise > 0, 'partial payment must leave balance due');

  const queueItem = rentRowToQueueItem(
    { ...row, outstandingPaise: admin.outstandingPaise, effectiveStatus: admin.effectiveStatus },
    '2026-09-11',
  );
  assert.ok(queueItem);
  assert.equal(queueItem!.amountPaise, admin.outstandingPaise);
});

test('full-month rent: lateFeeBasePaise equals rentPaise', () => {
  const inv = stubProratedInvoice({
    rentPaise: 500_000,
    lateFeeBasePaise: 500_000,
    paidPrincipalPaise: 0,
    paidLateFeePaise: 0,
    status: 'overdue',
  });
  const projected = projectInvoice(buildRentInvoiceProjectInput(inv));
  assert.ok(projected.outstandingPaise > 500_000, 'overdue full-month includes late fee');
  assert.equal(
    projectAdminRentInvoiceRow(adminRowFromInvoice(inv)).outstandingPaise,
    projected.outstandingPaise,
  );
});

test('paid invoice: all surfaces show zero outstanding', () => {
  const inv = stubProratedInvoice({
    status: 'paid',
    lateFeeLockedPaise: 12_761,
    paidAt: new Date('2026-09-10T00:00:00.000Z'),
  });
  const projected = projectInvoice(buildRentInvoiceProjectInput(inv));
  const admin = projectAdminRentInvoiceRow(adminRowFromInvoice(inv));
  assert.equal(projected.outstandingPaise, 0);
  assert.equal(admin.outstandingPaise, 0);
});

test('recordRentPaymentSuccess loads full row including lateFeeBasePaise', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/rentInvoices.ts'), 'utf8');
  assert.match(src, /buildRentInvoiceProjectInput/);
  assert.match(
    src,
    /recordRentPaymentSuccess[\s\S]*?\.select\(\)\s*\n\s*\.from\(rentInvoices\)/,
  );
});

test('admin open rent query selects lateFeeBasePaise and filters zero outstanding', () => {
  const src = readFileSync(join(process.cwd(), 'src/db/queries/admin.ts'), 'utf8');
  assert.match(src, /lateFeeBasePaise: rentInvoices\.lateFeeBasePaise/);
  assert.match(src, /projectAdminRentInvoiceRow/);
  assert.match(src, /\.filter\(\(r\) => r\.outstandingPaise > 0\)/);
});

test('cash settlement blocks when canonical balance is zero', () => {
  const src = readFileSync(join(process.cwd(), 'src/services/adminCashSettlement.ts'), 'utf8');
  assert.match(src, /Nothing due on this invoice/);
  assert.match(src, /reconcileRentInvoiceCanonicalPaidState/);
});
