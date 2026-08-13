/**
 * Billing integrity detector — cross-surface payment/invoice consistency checks.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  customers,
  electricityInvoices,
  financialInvoices,
  payments,
  rentInvoices,
} from '@/src/db/schema';
import { todayString } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { listRoomElectricityPeerMismatches } from '@/src/lib/billing/roomElectricityReconciliation';
import { isLateFeeAbovePrincipalCap, lateFeeCapPaise } from '@/src/services/lateFeePolicyCore';
import { computeRentDuePaise } from '@/src/services/rentInvoices';

export const BILLING_INTEGRITY_CHECK_TYPES = [
  'APPROVED_PAYMENT_INVOICE_DUE',
  'INVOICE_PAID_WITHOUT_PAYMENT',
  'MISSING_ELECTRICITY_INVOICE',
  'DUPLICATE_SOURCE_INVOICE',
  'DUPLICATE_APPROVED_PAYMENT',
  'ROOM_PEER_BILLING_MISMATCH',
  'SOURCE_MIRROR_MISMATCH',
  'LATE_FEE_ABOVE_CAP',
] as const;

export type BillingIntegrityCheckType = (typeof BILLING_INTEGRITY_CHECK_TYPES)[number];

export type BillingIntegrityIssue = {
  checkType: BillingIntegrityCheckType;
  customerId: string;
  customerName: string;
  bookingId?: string | null;
  invoiceId?: string | null;
  sourceInvoiceId?: string | null;
  sourceTable?: string | null;
  unifiedInvoiceId?: string | null;
  paymentId?: string | null;
  roomId?: string | null;
  roomNumber?: string | null;
  billingMonth?: string | null;
  amountPaise?: number;
  detail: string;
  metadata?: Record<string, unknown>;
  autoRepairable: boolean;
};

export type BillingIntegrityAuditReport = {
  asOf: string;
  billingMonth: string;
  issues: BillingIntegrityIssue[];
  allocationIssues: import('@/src/services/allocationIntegrityAudit').AllocationIntegrityIssue[];
  summary: {
    issueCount: number;
    byCheckType: Record<BillingIntegrityCheckType, number>;
    autoRepairableCount: number;
    allocationIssueCount: number;
    allocationByCheckType: Record<
      import('@/src/services/allocationIntegrityAudit').AllocationIntegrityCheckType,
      number
    >;
  };
};

function emptyByCheckType(): Record<BillingIntegrityCheckType, number> {
  return {
    APPROVED_PAYMENT_INVOICE_DUE: 0,
    INVOICE_PAID_WITHOUT_PAYMENT: 0,
    MISSING_ELECTRICITY_INVOICE: 0,
    DUPLICATE_SOURCE_INVOICE: 0,
    DUPLICATE_APPROVED_PAYMENT: 0,
    ROOM_PEER_BILLING_MISMATCH: 0,
    SOURCE_MIRROR_MISMATCH: 0,
    LATE_FEE_ABOVE_CAP: 0,
  };
}

async function checkApprovedPaymentInvoiceDue(): Promise<BillingIntegrityIssue[]> {
  const issues: BillingIntegrityIssue[] = [];

  const rentRows = await db
    .select({
      paymentId: payments.id,
      providerPaymentId: payments.providerPaymentId,
      amountPaise: payments.amountPaise,
      invoiceId: rentInvoices.id,
      invoiceStatus: rentInvoices.status,
      customerId: rentInvoices.customerId,
      customerName: customers.fullName,
      bookingId: rentInvoices.bookingId,
      invoiceNumber: rentInvoices.invoiceNumber,
    })
    .from(payments)
    .innerJoin(rentInvoices, eq(rentInvoices.paymentId, payments.id))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(
      and(
        eq(payments.status, 'succeeded'),
        eq(payments.purpose, 'rent'),
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
      ),
    );

  for (const row of rentRows) {
    issues.push({
      checkType: 'APPROVED_PAYMENT_INVOICE_DUE',
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      invoiceId: row.invoiceId,
      sourceInvoiceId: row.invoiceId,
      sourceTable: 'rent_invoices',
      paymentId: row.paymentId,
      amountPaise: row.amountPaise,
      detail: `Rent invoice ${row.invoiceNumber} is ${row.invoiceStatus} but payment ${row.providerPaymentId} succeeded`,
      autoRepairable: true,
    });
  }

  const elecRows = await db
    .select({
      paymentId: payments.id,
      providerPaymentId: payments.providerPaymentId,
      amountPaise: payments.amountPaise,
      invoiceId: electricityInvoices.id,
      invoiceStatus: electricityInvoices.status,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      bookingId: electricityInvoices.bookingId,
      invoiceNumber: electricityInvoices.invoiceNumber,
    })
    .from(payments)
    .innerJoin(electricityInvoices, eq(electricityInvoices.paymentId, payments.id))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(payments.status, 'succeeded'),
        eq(payments.purpose, 'electricity'),
        eq(electricityInvoices.status, 'pending'),
      ),
    );

  for (const row of elecRows) {
    issues.push({
      checkType: 'APPROVED_PAYMENT_INVOICE_DUE',
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      invoiceId: row.invoiceId,
      sourceInvoiceId: row.invoiceId,
      sourceTable: 'electricity_invoices',
      paymentId: row.paymentId,
      amountPaise: row.amountPaise,
      detail: `Electricity invoice ${row.invoiceNumber} is ${row.invoiceStatus} but payment ${row.providerPaymentId} succeeded`,
      autoRepairable: true,
    });
  }

  return issues;
}

async function checkInvoicePaidWithoutPayment(): Promise<BillingIntegrityIssue[]> {
  const issues: BillingIntegrityIssue[] = [];

  const rentPaid = await db
    .select({
      invoiceId: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      customerId: rentInvoices.customerId,
      customerName: customers.fullName,
      bookingId: rentInvoices.bookingId,
      paymentId: rentInvoices.paymentId,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(and(eq(rentInvoices.status, 'paid'), sql`${rentInvoices.paymentId} IS NULL`));

  for (const row of rentPaid) {
    issues.push({
      checkType: 'INVOICE_PAID_WITHOUT_PAYMENT',
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      invoiceId: row.invoiceId,
      sourceInvoiceId: row.invoiceId,
      sourceTable: 'rent_invoices',
      detail: `Rent invoice ${row.invoiceNumber} is paid without linked payment`,
      autoRepairable: false,
    });
  }

  const elecPaid = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      bookingId: electricityInvoices.bookingId,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(and(eq(electricityInvoices.status, 'paid'), sql`${electricityInvoices.paymentId} IS NULL`));

  for (const row of elecPaid) {
    issues.push({
      checkType: 'INVOICE_PAID_WITHOUT_PAYMENT',
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      invoiceId: row.invoiceId,
      sourceInvoiceId: row.invoiceId,
      sourceTable: 'electricity_invoices',
      detail: `Electricity invoice ${row.invoiceNumber} is paid without linked payment`,
      autoRepairable: false,
    });
  }

  return issues;
}

async function checkDuplicateSourceInvoices(): Promise<BillingIntegrityIssue[]> {
  const issues: BillingIntegrityIssue[] = [];

  const rentDupes = await db.execute<{
    customer_id: string;
    billing_month: string;
    bed_id: string;
    cnt: number;
    customer_name: string;
  }>(sql`
    SELECT ri.customer_id, ri.billing_month, ri.bed_id, count(*)::int AS cnt, c.full_name AS customer_name
    FROM rent_invoices ri
    INNER JOIN customers c ON c.id = ri.customer_id
    WHERE ri.status NOT IN ('cancelled')
      AND ri.is_adhoc = false
    GROUP BY ri.customer_id, ri.billing_month, ri.bed_id
    HAVING count(*) > 1
  `);

  for (const row of rentDupes) {
    issues.push({
      checkType: 'DUPLICATE_SOURCE_INVOICE',
      customerId: row.customer_id,
      customerName: row.customer_name,
      billingMonth: row.billing_month,
      detail: `Duplicate rent invoices for customer in ${row.billing_month} (${row.cnt} rows)`,
      metadata: { bedId: row.bed_id, count: row.cnt },
      autoRepairable: false,
    });
  }

  const elecDupes = await db.execute<{
    customer_id: string;
    billing_month: string;
    electricity_bill_id: string;
    cnt: number;
    customer_name: string;
  }>(sql`
    SELECT ei.customer_id, ei.billing_month, ei.electricity_bill_id, count(*)::int AS cnt, c.full_name AS customer_name
    FROM electricity_invoices ei
    INNER JOIN customers c ON c.id = ei.customer_id
    WHERE ei.status NOT IN ('cancelled')
    GROUP BY ei.customer_id, ei.billing_month, ei.electricity_bill_id
    HAVING count(*) > 1
  `);

  for (const row of elecDupes) {
    issues.push({
      checkType: 'DUPLICATE_SOURCE_INVOICE',
      customerId: row.customer_id,
      customerName: row.customer_name,
      billingMonth: row.billing_month,
      detail: `Duplicate electricity invoices for customer in ${row.billing_month} (${row.cnt} rows)`,
      metadata: { electricityBillId: row.electricity_bill_id, count: row.cnt },
      autoRepairable: false,
    });
  }

  return issues;
}

async function checkDuplicateApprovedPayments(): Promise<BillingIntegrityIssue[]> {
  const issues: BillingIntegrityIssue[] = [];

  const dupes = await db.execute<{
    provider: string;
    provider_payment_id: string;
    cnt: number;
  }>(sql`
    SELECT provider, provider_payment_id, count(*)::int AS cnt
    FROM payments
    WHERE status = 'succeeded'
    GROUP BY provider, provider_payment_id
    HAVING count(*) > 1
  `);

  for (const row of dupes) {
    issues.push({
      checkType: 'DUPLICATE_APPROVED_PAYMENT',
      customerId: '',
      customerName: '—',
      detail: `Duplicate succeeded payments for ${row.provider}:${row.provider_payment_id} (${row.cnt} rows)`,
      metadata: { provider: row.provider, providerPaymentId: row.provider_payment_id, count: row.cnt },
      autoRepairable: false,
    });
  }

  return issues;
}

async function checkSourceMirrorMismatch(): Promise<BillingIntegrityIssue[]> {
  const issues: BillingIntegrityIssue[] = [];

  const rentMirror = await db
    .select({
      unifiedId: financialInvoices.id,
      unifiedStatus: financialInvoices.status,
      sourceId: financialInvoices.sourceId,
      customerId: financialInvoices.customerId,
      customerName: customers.fullName,
      sourceStatus: rentInvoices.status,
      invoiceNumber: rentInvoices.invoiceNumber,
      sourcePaymentId: rentInvoices.paymentId,
      mirrorPaymentId: financialInvoices.paymentId,
    })
    .from(financialInvoices)
    .innerJoin(rentInvoices, eq(rentInvoices.id, financialInvoices.sourceId))
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .where(eq(financialInvoices.sourceTable, 'rent_invoices'));

  for (const row of rentMirror) {
    const sourcePaid = row.sourceStatus === 'paid';
    const mirrorPaid = row.unifiedStatus === 'paid' || row.unifiedStatus === 'settled';
    const paymentMismatch = (row.sourcePaymentId ?? null) !== (row.mirrorPaymentId ?? null);
    if ((sourcePaid !== mirrorPaid) || (sourcePaid && paymentMismatch)) {
      issues.push({
        checkType: 'SOURCE_MIRROR_MISMATCH',
        customerId: row.customerId,
        customerName: row.customerName,
        invoiceId: row.unifiedId,
        unifiedInvoiceId: row.unifiedId,
        sourceInvoiceId: row.sourceId,
        sourceTable: 'rent_invoices',
        detail: `Rent ${row.invoiceNumber}: source=${row.sourceStatus}, mirror=${row.unifiedStatus}`,
        metadata: {
          sourcePaymentId: row.sourcePaymentId,
          mirrorPaymentId: row.mirrorPaymentId,
        },
        autoRepairable: true,
      });
    }
  }

  const elecMirror = await db
    .select({
      unifiedId: financialInvoices.id,
      unifiedStatus: financialInvoices.status,
      sourceId: financialInvoices.sourceId,
      customerId: financialInvoices.customerId,
      customerName: customers.fullName,
      sourceStatus: electricityInvoices.status,
      invoiceNumber: electricityInvoices.invoiceNumber,
      sourcePaymentId: electricityInvoices.paymentId,
      mirrorPaymentId: financialInvoices.paymentId,
    })
    .from(financialInvoices)
    .innerJoin(electricityInvoices, eq(electricityInvoices.id, financialInvoices.sourceId))
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .where(eq(financialInvoices.sourceTable, 'electricity_invoices'));

  for (const row of elecMirror) {
    const sourcePaid = row.sourceStatus === 'paid';
    const mirrorPaid = row.unifiedStatus === 'paid' || row.unifiedStatus === 'settled';
    const paymentMismatch = (row.sourcePaymentId ?? null) !== (row.mirrorPaymentId ?? null);
    if ((sourcePaid !== mirrorPaid) || (sourcePaid && paymentMismatch)) {
      issues.push({
        checkType: 'SOURCE_MIRROR_MISMATCH',
        customerId: row.customerId,
        customerName: row.customerName,
        invoiceId: row.unifiedId,
        unifiedInvoiceId: row.unifiedId,
        sourceInvoiceId: row.sourceId,
        sourceTable: 'electricity_invoices',
        detail: `Electricity ${row.invoiceNumber}: source=${row.sourceStatus}, mirror=${row.unifiedStatus}`,
        metadata: {
          sourcePaymentId: row.sourcePaymentId,
          mirrorPaymentId: row.mirrorPaymentId,
        },
        autoRepairable: true,
      });
    }
  }

  return issues;
}

async function checkMissingElectricityInvoices(billingMonth: string): Promise<BillingIntegrityIssue[]> {
  const mismatches = await listRoomElectricityPeerMismatches(billingMonth);
  const issues: BillingIntegrityIssue[] = [];

  for (const { roomId, roomNumber, report } of mismatches) {
    for (const customerId of report.missingInvoiceCustomerIds) {
      const occ = report.occupants.find((o) => o.customerId === customerId);
      issues.push({
        checkType: 'MISSING_ELECTRICITY_INVOICE',
        customerId,
        customerName: occ?.customerName ?? customerId,
        bookingId: occ?.bookingId,
        roomId,
        roomNumber,
        billingMonth,
        detail: `Eligible occupant missing electricity invoice for room ${roomNumber ?? roomId} / ${billingMonth}`,
        metadata: { bedIds: occ?.bedIds },
        autoRepairable: false,
      });
    }

    if (report.missingInvoiceCustomerIds.length > 0 || report.peerMismatch) {
      issues.push({
        checkType: 'ROOM_PEER_BILLING_MISMATCH',
        customerId: '',
        customerName: '—',
        roomId,
        roomNumber,
        billingMonth,
        detail: `Room ${roomNumber ?? roomId}: ${report.eligibleCount} eligible, ${report.invoicedCount} invoiced`,
        metadata: {
          occupants: report.occupants,
          missingInvoiceCustomerIds: report.missingInvoiceCustomerIds,
        },
        autoRepairable: false,
      });
    }
  }

  return issues;
}

/** Open invoices with stored late-fee fields above the 10% principal cap — review only, no auto-rewrite. */
async function checkLateFeeAboveCap(): Promise<BillingIntegrityIssue[]> {
  const issues: BillingIntegrityIssue[] = [];

  const rentRows = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      customerId: rentInvoices.customerId,
      customerName: customers.fullName,
      bookingId: rentInvoices.bookingId,
      rentPaise: rentInvoices.rentPaise,
      discountPaise: rentInvoices.discountPaise,
      lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
      proofSnapshotLateFeePaise: rentInvoices.proofSnapshotLateFeePaise,
      billingMonth: rentInvoices.billingMonth,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']));

  for (const row of rentRows) {
    const principal = computeRentDuePaise(row.rentPaise, row.discountPaise);
    const cap = lateFeeCapPaise(principal);
    const storedCandidates = [
      row.lateFeeLockedPaise,
      row.proofSnapshotLateFeePaise,
    ].filter((v): v is number => v != null && v > 0);
    const exceeded = storedCandidates.find((v) => isLateFeeAbovePrincipalCap(principal, v));
    if (!exceeded) continue;
    issues.push({
      checkType: 'LATE_FEE_ABOVE_CAP',
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      invoiceId: row.id,
      sourceInvoiceId: row.id,
      sourceTable: 'rent_invoices',
      billingMonth: row.billingMonth,
      amountPaise: exceeded,
      detail: `Rent ${row.invoiceNumber}: stored late fee ${exceeded} paise exceeds 10% cap ${cap} paise on principal ${principal}`,
      metadata: { capPaise: cap, principalPaise: principal, paidLateFeePaise: row.paidLateFeePaise },
      autoRepairable: false,
    });
  }

  const elecRows = await db
    .select({
      id: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      bookingId: electricityInvoices.bookingId,
      amountPaise: electricityInvoices.amountPaise,
      lateFeeLockedPaise: electricityInvoices.lateFeeLockedPaise,
      billingMonth: electricityInvoices.billingMonth,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(eq(electricityInvoices.status, 'pending'));

  for (const row of elecRows) {
    const principal = row.amountPaise;
    const cap = lateFeeCapPaise(principal);
    const locked = row.lateFeeLockedPaise;
    if (locked == null || locked <= 0) continue;
    if (!isLateFeeAbovePrincipalCap(principal, locked)) continue;
    issues.push({
      checkType: 'LATE_FEE_ABOVE_CAP',
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      invoiceId: row.id,
      sourceInvoiceId: row.id,
      sourceTable: 'electricity_invoices',
      billingMonth: row.billingMonth,
      amountPaise: locked,
      detail: `Electricity ${row.invoiceNumber}: locked late fee ${locked} paise exceeds 10% cap ${cap} paise on principal ${principal}`,
      metadata: { capPaise: cap, principalPaise: principal },
      autoRepairable: false,
    });
  }

  return issues;
}

export async function runBillingIntegrityCheck(
  billingMonth?: string,
): Promise<BillingIntegrityAuditReport> {
  const month = billingMonth ?? firstOfMonth(todayString());
  const asOf = new Date().toISOString();

  const { runAllocationIntegrityAudit } = await import('@/src/services/allocationIntegrityAudit');

  const [
    approvedPaymentDue,
    paidWithoutPayment,
    duplicateInvoices,
    duplicatePayments,
    mirrorMismatch,
    electricityGaps,
    lateFeeAboveCap,
    allocationReport,
  ] = await Promise.all([
    checkApprovedPaymentInvoiceDue(),
    checkInvoicePaidWithoutPayment(),
    checkDuplicateSourceInvoices(),
    checkDuplicateApprovedPayments(),
    checkSourceMirrorMismatch(),
    checkMissingElectricityInvoices(month),
    checkLateFeeAboveCap(),
    runAllocationIntegrityAudit(),
  ]);

  const issues = [
    ...approvedPaymentDue,
    ...paidWithoutPayment,
    ...duplicateInvoices,
    ...duplicatePayments,
    ...mirrorMismatch,
    ...electricityGaps,
    ...lateFeeAboveCap,
  ];

  const byCheckType = emptyByCheckType();
  for (const issue of issues) {
    byCheckType[issue.checkType] += 1;
  }

  return {
    asOf,
    billingMonth: month,
    issues,
    allocationIssues: allocationReport.issues,
    summary: {
      issueCount: issues.length,
      byCheckType,
      autoRepairableCount: issues.filter((i) => i.autoRepairable).length,
      allocationIssueCount: allocationReport.summary.issueCount,
      allocationByCheckType: allocationReport.summary.byCheckType,
    },
  };
}
