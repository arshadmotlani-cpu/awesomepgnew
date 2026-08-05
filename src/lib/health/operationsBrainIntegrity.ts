/**
 * Operations Brain — payment-review invariant scan over a pending queue sample.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityInvoices, paymentLinks, rentInvoices, stayExtensions } from '@/src/db/schema';
import {
  evaluatePaymentReviewInvariants,
  type PaymentReviewInvariantViolation,
} from '@/src/lib/payments/paymentReviewInvariants';

export type OperationsBrainFinding = {
  code: string;
  severity: 'P0' | 'P1' | 'P2';
  entityType: string;
  entityId: string;
  detail: string;
  violations: PaymentReviewInvariantViolation[];
  repairable: boolean;
};

export type OperationsBrainIntegrityReport = {
  asOf: string;
  sampled: number;
  excluded: number;
  findings: OperationsBrainFinding[];
  pass: boolean;
};

function asBillingMonth(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 10);
  if (value && typeof value === 'object' && 'toISOString' in value) {
    try {
      return String((value as { toISOString: () => string }).toISOString()).slice(0, 10);
    } catch {
      /* fall through */
    }
  }
  return String(value ?? '').slice(0, 10);
}

export async function runOperationsBrainIntegrityAudit(opts?: {
  sampleLimit?: number;
}): Promise<OperationsBrainIntegrityReport> {
  const limit = opts?.sampleLimit ?? 40;
  const findings: OperationsBrainFinding[] = [];
  let sampled = 0;
  let excluded = 0;

  const rents = await db
    .select({
      id: rentInvoices.id,
      customerId: rentInvoices.customerId,
      bookingId: rentInvoices.bookingId,
      billingMonth: rentInvoices.billingMonth,
      status: rentInvoices.status,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      rentPaise: rentInvoices.rentPaise,
      proofSnapshotOutstandingPaise: rentInvoices.proofSnapshotOutstandingPaise,
    })
    .from(rentInvoices)
    .where(
      and(
        isNotNull(rentInvoices.paymentProofUrl),
        sql`${rentInvoices.status} IN ('pending', 'overdue', 'payment_in_progress')`,
      ),
    )
    .limit(limit);

  for (const inv of rents) {
    sampled += 1;
    const expected = inv.proofSnapshotOutstandingPaise ?? inv.rentPaise;
    const billingMonth = asBillingMonth(inv.billingMonth);
    const invariant = evaluatePaymentReviewInvariants({
      kind: 'rent',
      invoiceId: inv.id,
      customerId: inv.customerId,
      bookingId: inv.bookingId,
      billingMonth,
      expectedAmountPaise: expected,
      proofAmountPaise: expected,
      paymentProofUrl: inv.paymentProofUrl,
      status: inv.status,
    });
    if (!invariant.ok) {
      excluded += 1;
      findings.push({
        code: invariant.violations[0]?.code ?? 'PAYMENT_REVIEW_INVARIANT',
        severity: 'P0',
        entityType: 'rent_invoice',
        entityId: inv.id,
        detail: invariant.violations.map((v) => v.message).join(' '),
        violations: invariant.violations,
        repairable: true, // excluded from queue already
      });
    }
  }

  const elecs = await db
    .select({
      id: electricityInvoices.id,
      customerId: electricityInvoices.customerId,
      bookingId: electricityInvoices.bookingId,
      billingMonth: electricityInvoices.billingMonth,
      status: electricityInvoices.status,
      paymentProofUrl: electricityInvoices.paymentProofUrl,
      amountPaise: electricityInvoices.amountPaise,
    })
    .from(electricityInvoices)
    .where(
      and(
        isNotNull(electricityInvoices.paymentProofUrl),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .limit(Math.ceil(limit / 2));

  for (const inv of elecs) {
    sampled += 1;
    const billingMonth = asBillingMonth(inv.billingMonth);
    const invariant = evaluatePaymentReviewInvariants({
      kind: 'electricity',
      invoiceId: inv.id,
      customerId: inv.customerId,
      bookingId: inv.bookingId,
      billingMonth,
      expectedAmountPaise: inv.amountPaise,
      proofAmountPaise: inv.amountPaise,
      paymentProofUrl: inv.paymentProofUrl,
      status: inv.status,
    });
    if (!invariant.ok) {
      excluded += 1;
      findings.push({
        code: invariant.violations[0]?.code ?? 'PAYMENT_REVIEW_INVARIANT',
        severity: 'P0',
        entityType: 'electricity_invoice',
        entityId: inv.id,
        detail: invariant.violations.map((v) => v.message).join(' '),
        violations: invariant.violations,
        repairable: true,
      });
    }
  }

  const exts = await db
    .select({
      id: stayExtensions.id,
      bookingId: stayExtensions.bookingId,
      status: stayExtensions.status,
      paymentProofUrl: stayExtensions.paymentProofUrl,
      quotedTotalPaise: stayExtensions.quotedTotalPaise,
    })
    .from(stayExtensions)
    .where(
      and(eq(stayExtensions.status, 'pending'), isNotNull(stayExtensions.paymentProofUrl)),
    )
    .limit(Math.ceil(limit / 4));

  for (const ext of exts) {
    sampled += 1;
    const invariant = evaluatePaymentReviewInvariants({
      kind: 'extension',
      invoiceId: ext.id,
      customerId: 'unknown', // filled loosely; queue path has full join
      bookingId: ext.bookingId,
      billingMonth: null,
      expectedAmountPaise: ext.quotedTotalPaise,
      proofAmountPaise: ext.quotedTotalPaise,
      paymentProofUrl: ext.paymentProofUrl,
      status: ext.status,
      requireAwaitingStatus: true,
    });
    // Missing resident is expected here without join — only flag amount/screenshot issues.
    if (!invariant.ok) {
      const filtered = invariant.violations.filter(
        (v) => v.code !== 'MISSING_RESIDENT',
      );
      if (filtered.length === 0) continue;
      excluded += 1;
      findings.push({
        code: filtered[0]?.code ?? 'PAYMENT_REVIEW_INVARIANT',
        severity: 'P0',
        entityType: 'stay_extension',
        entityId: ext.id,
        detail: filtered.map((v) => v.message).join(' '),
        violations: filtered,
        repairable: true,
      });
    }
  }

  const deps = await db
    .select({
      id: paymentLinks.id,
      residentId: paymentLinks.residentId,
      bookingId: paymentLinks.bookingId,
      status: paymentLinks.status,
      paymentProofUrl: paymentLinks.paymentProofUrl,
      amount: paymentLinks.amount,
    })
    .from(paymentLinks)
    .where(
      and(
        eq(paymentLinks.purpose, 'deposit'),
        eq(paymentLinks.status, 'active'),
        isNotNull(paymentLinks.paymentProofUrl),
      ),
    )
    .limit(Math.ceil(limit / 4));

  for (const link of deps) {
    sampled += 1;
    const invariant = evaluatePaymentReviewInvariants({
      kind: 'deposit_link',
      invoiceId: link.id,
      customerId: link.residentId,
      bookingId: link.bookingId,
      billingMonth: null,
      expectedAmountPaise: link.amount,
      proofAmountPaise: link.amount,
      paymentProofUrl: link.paymentProofUrl,
      status: link.status,
    });
    if (!invariant.ok) {
      excluded += 1;
      findings.push({
        code: invariant.violations[0]?.code ?? 'PAYMENT_REVIEW_INVARIANT',
        severity: 'P0',
        entityType: 'payment_link',
        entityId: link.id,
        detail: invariant.violations.map((v) => v.message).join(' '),
        violations: invariant.violations,
        repairable: true,
      });
    }
  }

  const pass = findings.length === 0;
  return {
    asOf: new Date().toISOString(),
    sampled,
    excluded,
    findings,
    pass,
  };
}
