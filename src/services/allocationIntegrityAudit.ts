/**
 * Billing allocation integrity — rent, deposit, misc, refunds, outstanding.
 * Electricity allocation checks live elsewhere; this module skips electricity-only rows.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  checkoutSettlements,
  customers,
  paymentApprovalAllocations,
  pgPaymentRecords,
  rentInvoices,
} from '@/src/db/schema';
import { totalAllocatedPaise } from '@/src/lib/billing/bookingMoneyBalances';

export const ALLOCATION_INTEGRITY_CHECK_TYPES = [
  'PAID_WITHOUT_ALLOCATION',
  'LEDGER_MISMATCH',
  'ORPHAN_PAYMENT',
  'DOUBLE_ALLOCATION',
  'REFUND_MISMATCH',
] as const;

export type AllocationIntegrityCheckType = (typeof ALLOCATION_INTEGRITY_CHECK_TYPES)[number];

export type AllocationIntegrityIssue = {
  checkType: AllocationIntegrityCheckType;
  customerId: string;
  customerName: string;
  bookingId?: string | null;
  paymentId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  amountPaise?: number;
  detail: string;
  metadata?: Record<string, unknown>;
  autoRepairable: boolean;
};

export type AllocationIntegrityAuditReport = {
  asOf: string;
  issues: AllocationIntegrityIssue[];
  summary: {
    issueCount: number;
    byCheckType: Record<AllocationIntegrityCheckType, number>;
    autoRepairableCount: number;
  };
};

function emptyByCheckType(): Record<AllocationIntegrityCheckType, number> {
  return {
    PAID_WITHOUT_ALLOCATION: 0,
    LEDGER_MISMATCH: 0,
    ORPHAN_PAYMENT: 0,
    DOUBLE_ALLOCATION: 0,
    REFUND_MISMATCH: 0,
  };
}

async function checkPaidWithoutAllocation(): Promise<AllocationIntegrityIssue[]> {
  const issues: AllocationIntegrityIssue[] = [];

  const approvedProofs = await db
    .select({
      id: pgPaymentRecords.id,
      customerId: pgPaymentRecords.customerId,
      bookingId: pgPaymentRecords.bookingId,
      amountPaise: pgPaymentRecords.amountPaise,
      confirmedAmountPaise: pgPaymentRecords.confirmedAmountPaise,
      customerName: customers.fullName,
    })
    .from(pgPaymentRecords)
    .innerJoin(customers, eq(customers.id, pgPaymentRecords.customerId))
    .where(eq(pgPaymentRecords.status, 'approved'));

  if (approvedProofs.length === 0) return issues;

  const proofIds = approvedProofs.map((r) => r.id);
  const allocationRows = await db
    .select({ entityId: paymentApprovalAllocations.entityId })
    .from(paymentApprovalAllocations)
    .where(
      and(
        eq(paymentApprovalAllocations.entityType, 'pg_payment_record'),
        inArray(paymentApprovalAllocations.entityId, proofIds),
      ),
    );
  const allocated = new Set(allocationRows.map((r) => r.entityId));

  for (const row of approvedProofs) {
    if (allocated.has(row.id)) continue;
    const received = row.confirmedAmountPaise ?? row.amountPaise;
    if (received <= 0) continue;
    issues.push({
      checkType: 'PAID_WITHOUT_ALLOCATION',
      customerId: row.customerId,
      customerName: row.customerName,
      bookingId: row.bookingId,
      entityType: 'pg_payment_record',
      entityId: row.id,
      amountPaise: received,
      detail: `Approved payment proof ${row.id.slice(0, 8)} has no allocation snapshot`,
      autoRepairable: true,
    });
  }

  const paidRent = await db
    .select({
      id: rentInvoices.id,
      customerId: rentInvoices.customerId,
      bookingId: rentInvoices.bookingId,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
      customerName: customers.fullName,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .where(and(eq(rentInvoices.status, 'paid'), sql`${rentInvoices.paymentId} IS NOT NULL`));

  if (paidRent.length > 0) {
    const rentIds = paidRent.map((r) => r.id);
    const rentAlloc = await db
      .select({ entityId: paymentApprovalAllocations.entityId })
      .from(paymentApprovalAllocations)
      .where(
        and(
          eq(paymentApprovalAllocations.entityType, 'rent_invoice'),
          inArray(paymentApprovalAllocations.entityId, rentIds),
        ),
      );
    const rentAllocated = new Set(rentAlloc.map((r) => r.entityId));
    for (const row of paidRent) {
      if (rentAllocated.has(row.id)) continue;
      const paid = row.paidPrincipalPaise + row.paidLateFeePaise;
      if (paid <= 0) continue;
      issues.push({
        checkType: 'PAID_WITHOUT_ALLOCATION',
        customerId: row.customerId,
        customerName: row.customerName,
        bookingId: row.bookingId,
        entityType: 'rent_invoice',
        entityId: row.id,
        amountPaise: paid,
        detail: `Paid rent invoice ${row.id.slice(0, 8)} missing approval allocation row`,
        autoRepairable: false,
      });
    }
  }

  return issues;
}

async function checkLedgerMismatch(): Promise<AllocationIntegrityIssue[]> {
  const issues: AllocationIntegrityIssue[] = [];

  const rows = await db
    .select({
      entityType: paymentApprovalAllocations.entityType,
      entityId: paymentApprovalAllocations.entityId,
      bookingId: paymentApprovalAllocations.bookingId,
      customerId: paymentApprovalAllocations.customerId,
      roomChargesPaidPaise: paymentApprovalAllocations.roomChargesPaidPaise,
      securityDepositPaidPaise: paymentApprovalAllocations.securityDepositPaidPaise,
      electricityPaidPaise: paymentApprovalAllocations.electricityPaidPaise,
      otherPaidPaise: paymentApprovalAllocations.otherPaidPaise,
      totalAmountReceivedPaise: paymentApprovalAllocations.totalAmountReceivedPaise,
      confirmedReceivedPaise: paymentApprovalAllocations.confirmedReceivedPaise,
      customerName: customers.fullName,
    })
    .from(paymentApprovalAllocations)
    .leftJoin(customers, eq(customers.id, paymentApprovalAllocations.customerId));

  for (const row of rows) {
    const nonElecAllocated =
      row.roomChargesPaidPaise + row.securityDepositPaidPaise + row.otherPaidPaise;
    const allocated = totalAllocatedPaise({
      confirmedReceivedPaise: row.confirmedReceivedPaise ?? row.totalAmountReceivedPaise,
      rentAllocatedPaise: row.roomChargesPaidPaise,
      depositAllocatedPaise: row.securityDepositPaidPaise,
      electricityAllocatedPaise: row.electricityPaidPaise,
      otherAllocatedPaise: row.otherPaidPaise,
    });
    const received = row.confirmedReceivedPaise ?? row.totalAmountReceivedPaise;
    if (allocated !== received) {
      issues.push({
        checkType: 'LEDGER_MISMATCH',
        customerId: row.customerId ?? '',
        customerName: row.customerName ?? '—',
        bookingId: row.bookingId,
        entityType: row.entityType,
        entityId: row.entityId,
        amountPaise: received,
        detail: `Allocation components (₹${(allocated / 100).toFixed(0)}) ≠ received (₹${(received / 100).toFixed(0)}) for ${row.entityType}`,
        metadata: {
          roomChargesPaidPaise: row.roomChargesPaidPaise,
          securityDepositPaidPaise: row.securityDepositPaidPaise,
          otherPaidPaise: row.otherPaidPaise,
          nonElecAllocated,
        },
        autoRepairable: false,
      });
    }
  }

  return issues;
}

async function checkOrphanPayments(): Promise<AllocationIntegrityIssue[]> {
  const issues: AllocationIntegrityIssue[] = [];

  const orphanRows = await db.execute<{
    payment_id: string;
    booking_id: string;
    amount_paise: string;
    purpose: string;
    customer_id: string;
    customer_name: string;
  }>(sql`
    SELECT
      p.id::text AS payment_id,
      p.booking_id::text AS booking_id,
      p.amount_paise::text AS amount_paise,
      p.purpose::text AS purpose,
      b.customer_id::text AS customer_id,
      c.full_name AS customer_name
    FROM payments p
    INNER JOIN bookings b ON b.id = p.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE p.status = 'captured'
      AND p.purpose IN ('rent', 'deposit', 'booking', 'extension')
      AND NOT EXISTS (
        SELECT 1 FROM payment_approval_allocations paa
        WHERE paa.booking_id = p.booking_id
          AND paa.total_amount_received_paise >= p.amount_paise
      )
    LIMIT 200
  `);

  for (const row of orphanRows) {
    issues.push({
      checkType: 'ORPHAN_PAYMENT',
      customerId: row.customer_id,
      customerName: row.customer_name,
      bookingId: row.booking_id,
      paymentId: row.payment_id,
      amountPaise: Number(row.amount_paise),
      detail: `Captured ${row.purpose} payment ${row.payment_id.slice(0, 8)} has no matching allocation snapshot`,
      metadata: { purpose: row.purpose },
      autoRepairable: false,
    });
  }

  return issues;
}

async function checkDoubleAllocation(): Promise<AllocationIntegrityIssue[]> {
  const issues: AllocationIntegrityIssue[] = [];

  const dupes = await db.execute<{
    entity_type: string;
    entity_id: string;
    cnt: string;
  }>(sql`
    SELECT entity_type, entity_id::text, COUNT(*)::text AS cnt
    FROM payment_approval_allocations
    GROUP BY entity_type, entity_id
    HAVING COUNT(*) > 1
    LIMIT 100
  `);

  for (const row of dupes) {
    issues.push({
      checkType: 'DOUBLE_ALLOCATION',
      customerId: '',
      customerName: '—',
      entityType: row.entity_type,
      entityId: row.entity_id,
      detail: `Entity ${row.entity_type}:${row.entity_id.slice(0, 8)} has ${row.cnt} allocation rows`,
      metadata: { count: Number(row.cnt) },
      autoRepairable: false,
    });
  }

  return issues;
}

async function checkRefundMismatch(): Promise<AllocationIntegrityIssue[]> {
  const issues: AllocationIntegrityIssue[] = [];

  const settlements = await db
    .select({
      id: checkoutSettlements.id,
      bookingId: checkoutSettlements.bookingId,
      customerId: checkoutSettlements.customerId,
      status: checkoutSettlements.status,
      totalRefundPaise: checkoutSettlements.totalRefundPaise,
      depositRequiredPaise: checkoutSettlements.depositRequiredPaise,
      depositReceivedPaise: checkoutSettlements.depositReceivedPaise,
      customerName: customers.fullName,
    })
    .from(checkoutSettlements)
    .innerJoin(customers, eq(customers.id, checkoutSettlements.customerId))
    .where(inArray(checkoutSettlements.status, ['refund_paid', 'refund_pending', 'completed']))
    .limit(500);

  for (const row of settlements) {
    const refund = row.totalRefundPaise ?? 0;
    const depositCollected = row.depositReceivedPaise ?? 0;
    if (refund > depositCollected && depositCollected > 0) {
      issues.push({
        checkType: 'REFUND_MISMATCH',
        customerId: row.customerId,
        customerName: row.customerName,
        bookingId: row.bookingId,
        entityId: row.id,
        amountPaise: refund,
        detail: `Checkout settlement refund (₹${(refund / 100).toFixed(0)}) exceeds deposit collected (₹${(depositCollected / 100).toFixed(0)})`,
        metadata: { status: row.status },
        autoRepairable: false,
      });
    }
  }

  return issues;
}

export async function runAllocationIntegrityAudit(): Promise<AllocationIntegrityAuditReport> {
  const asOf = new Date().toISOString();

  const [paidWithout, ledgerMismatch, orphan, doubleAlloc, refundMismatch] = await Promise.all([
    checkPaidWithoutAllocation(),
    checkLedgerMismatch(),
    checkOrphanPayments(),
    checkDoubleAllocation(),
    checkRefundMismatch(),
  ]);

  const issues = [
    ...paidWithout,
    ...ledgerMismatch,
    ...orphan,
    ...doubleAlloc,
    ...refundMismatch,
  ];

  const byCheckType = emptyByCheckType();
  for (const issue of issues) {
    byCheckType[issue.checkType] += 1;
  }

  return {
    asOf,
    issues,
    summary: {
      issueCount: issues.length,
      byCheckType,
      autoRepairableCount: issues.filter((i) => i.autoRepairable).length,
    },
  };
}
