import { and, eq, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhPurchaseReturns,
  fyhVendorPayables,
  fyhVendorPaymentAllocations,
  fyhVendorPayments,
  type FyhPayableStatus,
} from '@/src/hair/db/schema';
import type { FyhVendorPaymentMethod } from '@/src/hair/lib/vendorPaymentMethods';
import type { HairDb } from '@/src/hair/services/stock';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';

export type VendorPaymentAllocationInput = {
  payableId: string;
  amountPaise: number;
};

export type RecordVendorPaymentInput = {
  vendorId: string;
  amountPaise: number;
  paymentMethod: FyhVendorPaymentMethod;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
  attachmentUrl?: string | null;
  attachmentContentType?: string | null;
  staffName: string;
  staffEmployeeId?: string | null;
  allocations?: VendorPaymentAllocationInput[];
};

export type ReverseVendorPaymentInput = {
  paymentId: string;
  reason: string;
  staffName: string;
  staffEmployeeId?: string | null;
};

function payableStatusFromBalance(
  amountPaise: number,
  balancePaise: number,
): FyhPayableStatus {
  if (balancePaise <= 0) return 'paid';
  if (balancePaise < amountPaise) return 'partial';
  return 'open';
}

async function sumActiveAllocationsForPayable(
  db: HairDb,
  payableId: string,
  ctx?: TenantContext | null,
): Promise<number> {
  const rows = await db
    .select({
      amountPaise: fyhVendorPaymentAllocations.amountPaise,
      paymentStatus: fyhVendorPayments.status,
    })
    .from(fyhVendorPaymentAllocations)
    .innerJoin(
      fyhVendorPayments,
      eq(fyhVendorPayments.id, fyhVendorPaymentAllocations.paymentId),
    )
    .where(and(orgFilter(fyhVendorPaymentAllocations.organizationId, ctx), eq(fyhVendorPaymentAllocations.payableId, payableId)));

  return rows
    .filter((r) => r.paymentStatus === 'active')
    .reduce((sum, r) => sum + r.amountPaise, 0);
}

/** Recompute payable balance from active allocations + return credits (audit SSOT). */
export async function refreshPayableBalance(db: HairDb, payableId: string, ctx?: TenantContext | null) {
  await db.execute(sql`SELECT id FROM fyh_vendor_payables WHERE id = ${payableId} FOR UPDATE`);

  const [payable] = await db
    .select()
    .from(fyhVendorPayables)
    .where(and(orgFilter(fyhVendorPayables.organizationId, ctx), eq(fyhVendorPayables.id, payableId)))
    .limit(1);
  if (!payable) throw new Error('Payable not found');

  const allocated = await sumActiveAllocationsForPayable(db, payableId, ctx);

  const [returnRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${fyhPurchaseReturns.creditPaise}), 0)`,
    })
    .from(fyhPurchaseReturns)
    .where(and(orgFilter(fyhPurchaseReturns.organizationId, ctx), locationFilter(fyhPurchaseReturns.locationId, ctx), eq(fyhPurchaseReturns.payableId, payableId)));

  const returnCredit = Number(returnRow?.total ?? 0);
  const balance = payable.amountPaise - allocated - returnCredit;
  if (balance < 0) {
    throw new Error('Payable over-credited — allocations and returns exceed invoice amount');
  }

  const status = payableStatusFromBalance(payable.amountPaise, balance);
  await db
    .update(fyhVendorPayables)
    .set({
      balancePaise: balance,
      status,
      updatedAt: new Date(),
    })
    .where(and(orgFilter(fyhVendorPayables.organizationId, ctx), eq(fyhVendorPayables.id, payableId)));

  return { balancePaise: balance, status };
}

async function assertPayableOpenForVendor(
  db: HairDb,
  payableId: string,
  vendorId: string,
  amountPaise: number,
) {
  const [payable] = await db
    .select()
    .from(fyhVendorPayables)
    .where(
      and(eq(fyhVendorPayables.id, payableId), eq(fyhVendorPayables.vendorId, vendorId)),
    )
    .limit(1);
  if (!payable) throw new Error('Invoice payable not found for this vendor');
  if (payable.status === 'paid' && payable.balancePaise <= 0) {
    throw new Error('Invoice is already fully paid');
  }
  if (amountPaise > payable.balancePaise) {
    throw new Error('Allocation exceeds invoice balance');
  }
  return payable;
}

function validateAllocations(
  paymentAmountPaise: number,
  allocations: VendorPaymentAllocationInput[],
) {
  if (!allocations.length) return;
  let sum = 0;
  for (const row of allocations) {
    if (row.amountPaise <= 0) throw new Error('Each allocation must be positive');
    sum += row.amountPaise;
  }
  if (sum > paymentAmountPaise) {
    throw new Error('Allocations cannot exceed payment amount');
  }
}

export async function nextVendorPaymentNumber(ctx?: TenantContext | null): Promise<string> {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VP-${ts}${rand}`;
}

export async function recordVendorPayment(input: RecordVendorPaymentInput, ctx?: TenantContext | null) {
  if (input.amountPaise <= 0) throw new Error('Payment amount must be positive');
  const allocations = input.allocations ?? [];
  validateAllocations(input.amountPaise, allocations);
  const paymentNumber = await nextVendorPaymentNumber();

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as HairDb;

    await tx.execute(sql`SELECT id FROM fyh_vendors WHERE id = ${input.vendorId} FOR UPDATE`);

    const [payment] = await tx
      .insert(fyhVendorPayments)
      .values({
        vendorId: input.vendorId,
        paymentNumber,
        amountPaise: input.amountPaise,
        paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentContentType: input.attachmentContentType ?? null,
        status: 'active',
        staffName: input.staffName.trim(),
        staffEmployeeId: input.staffEmployeeId ?? null,
      })
      .returning();

    for (const alloc of allocations) {
      await assertPayableOpenForVendor(db, alloc.payableId, input.vendorId, alloc.amountPaise);
      await tx.insert(fyhVendorPaymentAllocations).values({
        paymentId: payment!.id,
        payableId: alloc.payableId,
        amountPaise: alloc.amountPaise,
      });
      await refreshPayableBalance(db, alloc.payableId);
    }

    return payment!;
  });
}

export async function allocateVendorPayment(
  input: {
    paymentId: string;
    allocations: VendorPaymentAllocationInput[];
  },
  ctx?: TenantContext | null,
) {
  if (!input.allocations.length) throw new Error('Add at least one allocation');

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as HairDb;

    await tx.execute(
      sql`SELECT id FROM fyh_vendor_payments WHERE id = ${input.paymentId} FOR UPDATE`,
    );
    const [payment] = await tx
      .select()
      .from(fyhVendorPayments)
      .where(and(orgFilter(fyhVendorPayments.organizationId, ctx), eq(fyhVendorPayments.id, input.paymentId)))
      .limit(1);
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'reversed') throw new Error('Cannot allocate a reversed payment');

    const [allocatedRow] = await tx
      .select({
        total: sql<number>`coalesce(sum(${fyhVendorPaymentAllocations.amountPaise}), 0)`,
      })
      .from(fyhVendorPaymentAllocations)
      .where(and(orgFilter(fyhVendorPaymentAllocations.organizationId, ctx), eq(fyhVendorPaymentAllocations.paymentId, input.paymentId)));

    const alreadyAllocated = Number(allocatedRow?.total ?? 0);
    const newSum = input.allocations.reduce((s, a) => s + a.amountPaise, 0);
    validateAllocations(payment.amountPaise - alreadyAllocated, input.allocations);

    if (alreadyAllocated + newSum > payment.amountPaise) {
      throw new Error('Not enough unallocated advance on this payment');
    }

    for (const alloc of input.allocations) {
      await assertPayableOpenForVendor(
        db,
        alloc.payableId,
        payment.vendorId,
        alloc.amountPaise,
      );
      await tx.insert(fyhVendorPaymentAllocations).values({
        paymentId: payment.id,
        payableId: alloc.payableId,
        amountPaise: alloc.amountPaise,
      });
      await refreshPayableBalance(db, alloc.payableId);
    }

    return payment;
  });
}

export async function reverseVendorPayment(input: ReverseVendorPaymentInput, ctx?: TenantContext | null) {
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reversal reason is required');

  return hairDb.transaction(async (tx) => {
    const db = tx as unknown as HairDb;

    await tx.execute(
      sql`SELECT id FROM fyh_vendor_payments WHERE id = ${input.paymentId} FOR UPDATE`,
    );
    const [payment] = await tx
      .select()
      .from(fyhVendorPayments)
      .where(and(orgFilter(fyhVendorPayments.organizationId, ctx), eq(fyhVendorPayments.id, input.paymentId)))
      .limit(1);
    if (!payment) throw new Error('Payment not found');
    if (payment.status === 'reversed') throw new Error('Payment is already reversed');

    const allocations = await tx
      .select({ payableId: fyhVendorPaymentAllocations.payableId })
      .from(fyhVendorPaymentAllocations)
      .where(and(orgFilter(fyhVendorPaymentAllocations.organizationId, ctx), eq(fyhVendorPaymentAllocations.paymentId, payment.id)));

    await tx
      .update(fyhVendorPayments)
      .set({
        status: 'reversed',
        reversedAt: new Date(),
        reversedByStaffName: input.staffName.trim(),
        reversedByEmployeeId: input.staffEmployeeId ?? null,
        reversalReason: reason,
        updatedAt: new Date(),
      })
      .where(and(orgFilter(fyhVendorPayments.organizationId, ctx), eq(fyhVendorPayments.id, payment.id)));

    const payableIds = [...new Set(allocations.map((a) => a.payableId))];
    for (const payableId of payableIds) {
      await refreshPayableBalance(db, payableId);
    }

    return payment;
  });
}

export async function getPaymentUnallocatedPaise(paymentId: string, ctx?: TenantContext | null): Promise<number> {
  const [payment] = await hairDb
    .select()
    .from(fyhVendorPayments)
    .where(and(orgFilter(fyhVendorPayments.organizationId, ctx), eq(fyhVendorPayments.id, paymentId)))
    .limit(1);
  if (!payment || payment.status === 'reversed') return 0;

  const [row] = await hairDb
    .select({
      total: sql<number>`coalesce(sum(${fyhVendorPaymentAllocations.amountPaise}), 0)`,
    })
    .from(fyhVendorPaymentAllocations)
    .where(and(orgFilter(fyhVendorPaymentAllocations.organizationId, ctx), eq(fyhVendorPaymentAllocations.paymentId, paymentId)));

  return payment.amountPaise - Number(row?.total ?? 0);
}

export async function getVendorUnallocatedAdvance(vendorId: string, ctx?: TenantContext | null): Promise<number> {
  const payments = await hairDb
    .select()
    .from(fyhVendorPayments)
    .where(
      and(eq(fyhVendorPayments.vendorId, vendorId), eq(fyhVendorPayments.status, 'active')),
    );

  let total = 0;
  for (const payment of payments) {
    total += await getPaymentUnallocatedPaise(payment.id);
  }
  return total;
}

export async function listActiveVendorPayments(vendorId: string, ctx?: TenantContext | null) {
  return hairDb
    .select()
    .from(fyhVendorPayments)
    .where(and(orgFilter(fyhVendorPayments.organizationId, ctx), eq(fyhVendorPayments.vendorId, vendorId)))
    .orderBy(sql`${fyhVendorPayments.paymentDate} DESC`, sql`${fyhVendorPayments.createdAt} DESC`);
}
