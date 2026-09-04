/**
 * Pure planner: reconcile electricity invoices to canonical allocation.
 *
 * Handles BILL_AMOUNT_MISMATCH and orphan unpaid invoices.
 * Unpaid amount mismatches update in place (unique bill+booking constraint).
 * Never rewrites paid invoice amounts.
 */
import type {
  CanonicalElectricityInvoiceDraft,
  ExistingElectricityInvoiceFact,
} from '@/src/lib/billing/electricityBillMissingInvoiceRepairPlan';

export type ElectricityBillAllocationReconcilePlan = {
  ok: boolean;
  kind: 'noop' | 'reconcile' | 'paid_conflict';
  code: 'OK' | 'BILL_AMOUNT_MISMATCH' | 'PAID_INVOICE_CONFLICT';
  roomTotalPaise: number;
  canonicalAllocationPaise: number;
  cancel: ExistingElectricityInvoiceFact[];
  update: Array<ExistingElectricityInvoiceFact & { canonicalAmountPaise: number; activeDays: number; unitsShare: number }>;
  create: CanonicalElectricityInvoiceDraft[];
  preserve: ExistingElectricityInvoiceFact[];
  paidConflicts: ExistingElectricityInvoiceFact[];
  reasons: string[];
};

export function planElectricityBillAllocationReconcile(input: {
  roomTotalPaise: number;
  canonicalLines: CanonicalElectricityInvoiceDraft[];
  existingInvoices: ExistingElectricityInvoiceFact[];
}): ElectricityBillAllocationReconcilePlan {
  const roomTotalPaise = Math.max(0, Math.floor(input.roomTotalPaise));
  const existingActive = input.existingInvoices.filter((inv) => inv.status !== 'cancelled');
  const byCustomer = new Map(existingActive.map((inv) => [inv.customerId, inv] as const));

  const cancel: ExistingElectricityInvoiceFact[] = [];
  const update: ElectricityBillAllocationReconcilePlan['update'] = [];
  const create: CanonicalElectricityInvoiceDraft[] = [];
  const preserve: ExistingElectricityInvoiceFact[] = [];
  const paidConflicts: ExistingElectricityInvoiceFact[] = [];
  const reasons: string[] = [];
  const seenCustomers = new Set<string>();

  const canonicalPositive = input.canonicalLines.filter((line) => line.amountPaise > 0);
  const canonicalAllocationPaise = canonicalPositive.reduce(
    (sum, line) => sum + line.amountPaise,
    0,
  );

  if (canonicalAllocationPaise > roomTotalPaise) {
    reasons.push(
      `Canonical allocation ${canonicalAllocationPaise} exceeds room total ${roomTotalPaise}.`,
    );
  }

  for (const line of canonicalPositive) {
    if (seenCustomers.has(line.customerId)) {
      reasons.push(`Duplicate canonical line for customer ${line.customerId}.`);
      continue;
    }
    seenCustomers.add(line.customerId);

    const existing = byCustomer.get(line.customerId);
    if (!existing) {
      create.push(line);
      continue;
    }

    if (existing.paidPaise > 0) {
      preserve.push(existing);
      if (existing.amountPaise !== line.amountPaise) {
        paidConflicts.push(existing);
        reasons.push(
          `Paid invoice ${existing.invoiceNumber} amount ${existing.amountPaise} ` +
            `≠ canonical ${line.amountPaise}; refusing silent rewrite.`,
        );
      }
      continue;
    }

    if (existing.amountPaise === line.amountPaise) {
      preserve.push(existing);
      continue;
    }

    update.push({
      ...existing,
      canonicalAmountPaise: line.amountPaise,
      activeDays: line.activeDays,
      unitsShare: line.unitsShare,
    });
    reasons.push(
      `BILL_AMOUNT_MISMATCH: unpaid ${existing.invoiceNumber} ${existing.amountPaise} ` +
        `→ canonical ${line.amountPaise} for customer ${line.customerId}.`,
    );
  }

  for (const inv of existingActive) {
    if (seenCustomers.has(inv.customerId)) continue;
    if (inv.paidPaise > 0) {
      preserve.push(inv);
      paidConflicts.push(inv);
      reasons.push(
        `Paid orphan invoice ${inv.invoiceNumber} outside canonical occupancy; refusing delete.`,
      );
      continue;
    }
    cancel.push(inv);
    reasons.push(
      `Orphan unpaid invoice ${inv.invoiceNumber} outside canonical historical occupancy.`,
    );
  }

  if (paidConflicts.length > 0 || reasons.some((r) => r.includes('exceeds room total'))) {
    return {
      ok: false,
      kind: 'paid_conflict',
      code: 'PAID_INVOICE_CONFLICT',
      roomTotalPaise,
      canonicalAllocationPaise,
      cancel: [],
      update: [],
      create: [],
      preserve,
      paidConflicts,
      reasons,
    };
  }

  const preservedTotal = preserve.reduce((sum, inv) => sum + inv.amountPaise, 0);
  const updateTotal = update.reduce((sum, inv) => sum + inv.canonicalAmountPaise, 0);
  const createTotal = create.reduce((sum, line) => sum + line.amountPaise, 0);
  if (preservedTotal + updateTotal + createTotal > roomTotalPaise) {
    return {
      ok: false,
      kind: 'paid_conflict',
      code: 'PAID_INVOICE_CONFLICT',
      roomTotalPaise,
      canonicalAllocationPaise,
      cancel: [],
      update: [],
      create: [],
      preserve,
      paidConflicts,
      reasons: [
        ...reasons,
        `Projected invoice total ${preservedTotal + updateTotal + createTotal} exceeds room total ${roomTotalPaise}.`,
      ],
    };
  }

  if (cancel.length === 0 && update.length === 0 && create.length === 0) {
    return {
      ok: true,
      kind: 'noop',
      code: 'OK',
      roomTotalPaise,
      canonicalAllocationPaise,
      cancel: [],
      update: [],
      create: [],
      preserve,
      paidConflicts: [],
      reasons: [],
    };
  }

  return {
    ok: true,
    kind: 'reconcile',
    code: 'BILL_AMOUNT_MISMATCH',
    roomTotalPaise,
    canonicalAllocationPaise,
    cancel,
    update,
    create,
    preserve,
    paidConflicts: [],
    reasons,
  };
}
