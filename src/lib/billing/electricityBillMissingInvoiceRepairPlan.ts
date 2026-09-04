/**
 * Pure planner: electricity bill exists + missing resident invoice fan-out.
 * No DB. No meter mutation. Preserves existing invoices/payments.
 */
export type ExistingElectricityInvoiceFact = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  bookingId: string;
  amountPaise: number;
  paidPaise: number;
  status: string;
};

export type CanonicalElectricityInvoiceDraft = {
  customerId: string;
  customerName?: string;
  bookingId: string;
  bedId: string;
  amountPaise: number;
  unitsShare: number;
  activeDays: number;
};

export type ElectricityBillMissingInvoiceRepairPlan = {
  ok: boolean;
  kind: 'noop' | 'create_missing' | 'mismatch';
  roomTotalPaise: number;
  canonicalAllocationPaise: number;
  existingInvoiceTotalPaise: number;
  proposedCreateTotalPaise: number;
  projectedInvoiceTotalPaise: number;
  preserve: ExistingElectricityInvoiceFact[];
  create: CanonicalElectricityInvoiceDraft[];
  orphanPaid: ExistingElectricityInvoiceFact[];
  mismatchReasons: string[];
};

/**
 * Decide which invoices to create for a bill that is missing fan-out.
 * Never mutates existing invoice amounts. Never invents money beyond room total.
 */
export function planElectricityBillMissingInvoiceRepair(input: {
  roomTotalPaise: number;
  canonicalLines: CanonicalElectricityInvoiceDraft[];
  existingInvoices: ExistingElectricityInvoiceFact[];
}): ElectricityBillMissingInvoiceRepairPlan {
  const roomTotalPaise = Math.max(0, Math.floor(input.roomTotalPaise));
  const existingActive = input.existingInvoices.filter((inv) => inv.status !== 'cancelled');
  const byCustomer = new Map(existingActive.map((inv) => [inv.customerId, inv] as const));

  const preserve: ExistingElectricityInvoiceFact[] = [];
  const create: CanonicalElectricityInvoiceDraft[] = [];
  const mismatchReasons: string[] = [];
  const seenCustomers = new Set<string>();

  const canonicalPositive = input.canonicalLines.filter((line) => line.amountPaise > 0);
  const canonicalAllocationPaise = canonicalPositive.reduce((sum, line) => sum + line.amountPaise, 0);

  if (canonicalAllocationPaise > roomTotalPaise) {
    mismatchReasons.push(
      `Canonical allocation ${canonicalAllocationPaise} exceeds room total ${roomTotalPaise}.`,
    );
  }

  for (const line of canonicalPositive) {
    if (seenCustomers.has(line.customerId)) {
      mismatchReasons.push(`Duplicate canonical line for customer ${line.customerId}.`);
      continue;
    }
    seenCustomers.add(line.customerId);

    const existing = byCustomer.get(line.customerId);
    if (existing) {
      preserve.push(existing);
      // Paid invoices are immutable. Unpaid amount must match canonical or fail closed.
      if (existing.paidPaise > 0) {
        continue;
      }
      if (existing.amountPaise !== line.amountPaise) {
        mismatchReasons.push(
          `Existing unpaid invoice ${existing.invoiceNumber} amount ${existing.amountPaise} ` +
            `≠ canonical ${line.amountPaise} for customer ${line.customerId}.`,
        );
      }
      continue;
    }

    create.push(line);
  }

  const orphanPaid: ExistingElectricityInvoiceFact[] = [];
  for (const inv of existingActive) {
    if (seenCustomers.has(inv.customerId)) continue;
    if (inv.paidPaise > 0) {
      orphanPaid.push(inv);
      preserve.push(inv);
      continue;
    }
    mismatchReasons.push(
      `Orphan unpaid invoice ${inv.invoiceNumber} for customer ${inv.customerId} ` +
        `is outside canonical historical occupancy.`,
    );
  }

  const existingInvoiceTotalPaise = existingActive.reduce((sum, inv) => sum + inv.amountPaise, 0);
  const proposedCreateTotalPaise = create.reduce((sum, line) => sum + line.amountPaise, 0);
  const projectedInvoiceTotalPaise = existingInvoiceTotalPaise + proposedCreateTotalPaise;

  if (projectedInvoiceTotalPaise > roomTotalPaise) {
    mismatchReasons.push(
      `Projected invoice total ${projectedInvoiceTotalPaise} exceeds room total ${roomTotalPaise}.`,
    );
  }

  if (mismatchReasons.length > 0) {
    return {
      ok: false,
      kind: 'mismatch',
      roomTotalPaise,
      canonicalAllocationPaise,
      existingInvoiceTotalPaise,
      proposedCreateTotalPaise,
      projectedInvoiceTotalPaise,
      preserve,
      create: [],
      orphanPaid,
      mismatchReasons,
    };
  }

  if (create.length === 0) {
    return {
      ok: true,
      kind: 'noop',
      roomTotalPaise,
      canonicalAllocationPaise,
      existingInvoiceTotalPaise,
      proposedCreateTotalPaise: 0,
      projectedInvoiceTotalPaise: existingInvoiceTotalPaise,
      preserve,
      create: [],
      orphanPaid,
      mismatchReasons: [],
    };
  }

  return {
    ok: true,
    kind: 'create_missing',
    roomTotalPaise,
    canonicalAllocationPaise,
    existingInvoiceTotalPaise,
    proposedCreateTotalPaise,
    projectedInvoiceTotalPaise,
    preserve,
    create,
    orphanPaid,
    mismatchReasons: [],
  };
}

/** Detect BILL_WITHOUT_INVOICES: positive room bill, zero active invoices, historical occupants. */
export function isBillWithoutInvoicesCondition(input: {
  roomTotalPaise: number;
  existingActiveInvoiceCount: number;
  historicalOccupantCount: number;
}): boolean {
  return (
    input.roomTotalPaise > 0 &&
    input.existingActiveInvoiceCount === 0 &&
    input.historicalOccupantCount > 0
  );
}
