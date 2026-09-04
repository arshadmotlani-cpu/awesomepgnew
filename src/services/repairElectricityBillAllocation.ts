/**
 * Generic electricity bill allocation reconcile.
 *
 * Cancels unpaid incorrect/orphan invoices and creates canonical replacements.
 * Never rewrites paid invoice amounts. Preserves payment-proof rejection history
 * on cancelled invoices. Idempotent.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  beds,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { NewElectricityInvoice } from '@/src/db/schema/electricityInvoices';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import {
  planElectricityBillAllocationReconcile,
  type ElectricityBillAllocationReconcilePlan,
} from '@/src/lib/billing/electricityBillAllocationReconcilePlan';
import type {
  CanonicalElectricityInvoiceDraft,
  ExistingElectricityInvoiceFact,
} from '@/src/lib/billing/electricityBillMissingInvoiceRepairPlan';
import { getElectricityInvoiceSchemaCaps } from '@/src/lib/db/electricityInvoiceSchemaCaps';
import { countActiveBedsInRoom } from '@/src/lib/roomCapacitySsotDb';
import { formatDate } from '@/src/lib/dates';
import { composeElectricityBillBreakdown } from '@/src/lib/billing/buildElectricityBillBreakdown';
import { assertElectricityBreakdownCommitReady } from '@/src/lib/billing/assertElectricityBreakdownCommitReady';
import { electricityDueDate, firstOfMonth } from '@/src/services/billing';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import { sumManualElectricityCreditsForRoomMonth } from '@/src/services/electricitySettlementLedgerView';
import { findActiveElectricityInvoiceForResidentMonth } from '@/src/services/electricityInvoiceDuplicates';
import { nextElectricityInvoiceNumber } from '@/src/services/electricityBilling';
import { paiseToInr } from '@/src/lib/format';

function roundToHundredth(n: number): number {
  return Math.round(n * 100) / 100;
}

function pgErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: string }).code ?? '');
  }
  return null;
}

export type ElectricityBillAllocationPreview = {
  billId: string;
  pgName: string;
  roomId: string;
  roomNumber: string;
  billingMonth: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  unitsConsumed: number;
  ratePerUnitPaise: number;
  roomTotalPaise: number;
  prepaidCreditAppliedPaise: number;
  historicalResidents: Array<{
    customerId: string;
    customerName?: string;
    bookingId: string;
    activeDays: number;
    canonicalAmountPaise: number;
  }>;
  existingInvoices: ExistingElectricityInvoiceFact[];
  plan: ElectricityBillAllocationReconcilePlan;
};

export type RepairElectricityBillAllocationResult =
  | {
      ok: true;
      kind: 'noop' | 'reconciled';
      billId: string;
      cancelledInvoiceIds: string[];
      updatedInvoiceIds: string[];
      createdInvoiceIds: string[];
      preservedInvoiceIds: string[];
      preview: ElectricityBillAllocationPreview;
    }
  | {
      ok: false;
      kind: 'not_found' | 'paid_conflict' | 'write_failed';
      message: string;
      preview?: ElectricityBillAllocationPreview;
    };

async function loadCanonicalDrafts(input: {
  roomId: string;
  billingMonth: string;
  grossTotalPaise: number;
  unitsConsumed: number;
  prepaidCreditPaise: number;
}): Promise<{
  drafts: CanonicalElectricityInvoiceDraft[];
  occupants: Awaited<ReturnType<typeof loadRoomElectricityOccupantsForMonth>>;
  allocation: ReturnType<typeof allocateMonthlyElectricityInvoices>;
}> {
  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  const contributionsLoad = await loadRoomElectricityContributionsForMonth(
    input.roomId,
    input.billingMonth,
  );
  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(
    input.roomId,
    input.billingMonth,
  );
  const activeBedCount = await countActiveBedsInRoom(input.roomId);

  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: input.grossTotalPaise,
    prepaidCreditPaise: Math.max(0, input.prepaidCreditPaise),
    contributionsByCustomerId:
      contributionsLoad.contributions.length > 0 ? contributionsLoad.byCustomerId : undefined,
    manualCreditPaise: contributionsLoad.contributions.length > 0 ? undefined : manualCreditPaise,
    occupants: occupantLoad.occupants,
    checkoutCollectedByCustomerId: occupantLoad.checkoutCollectedByCustomerId,
    useProRata: true,
    activeBedCount,
    billingDays: occupantLoad.billingDays,
  });

  const invoiceAllocationByBooking = new Map(
    allocation.invoices
      .filter((line) => !line.excludedBecauseCheckoutPaid && line.amountPaise > 0)
      .map((line) => [line.bookingId, line.amountPaise]),
  );

  let fallbackBedId: string | null = null;
  const ensureFallbackBed = async (): Promise<string | null> => {
    if (fallbackBedId) return fallbackBedId;
    const [bed] = await db
      .select({ id: beds.id })
      .from(beds)
      .where(and(eq(beds.roomId, input.roomId), sql`${beds.archivedAt} IS NULL`))
      .orderBy(beds.bedCode)
      .limit(1);
    fallbackBedId = bed?.id ?? null;
    return fallbackBedId;
  };

  const byCustomer = new Map<string, CanonicalElectricityInvoiceDraft>();
  for (const occ of occupantLoad.occupants) {
    const amount = invoiceAllocationByBooking.get(occ.bookingId);
    if (amount == null || amount <= 0) continue;
    const calculatedShare = allocation.calculatedShareByCustomerId.get(occ.customerId) ?? 0;
    const unitsShare =
      input.grossTotalPaise > 0
        ? roundToHundredth((input.unitsConsumed * calculatedShare) / input.grossTotalPaise)
        : 0;
    const activeDays = occ.occupiedDates?.length ?? occ.weight;
    let bedId: string | null = [...(occ.bedIds ?? [])].sort()[0] ?? null;
    if (!bedId) bedId = await ensureFallbackBed();
    if (!bedId) continue;
    const existing = byCustomer.get(occ.customerId);
    if (existing) {
      existing.amountPaise += amount;
      existing.unitsShare = roundToHundredth(existing.unitsShare + unitsShare);
      existing.activeDays += activeDays;
    } else {
      byCustomer.set(occ.customerId, {
        customerId: occ.customerId,
        customerName: occ.customerName,
        bookingId: occ.bookingId,
        bedId,
        amountPaise: amount,
        unitsShare,
        activeDays,
      });
    }
  }

  return { drafts: [...byCustomer.values()], occupants: occupantLoad, allocation };
}

export async function previewElectricityBillAllocation(
  billId: string,
): Promise<ElectricityBillAllocationPreview | null> {
  const [bill] = await db
    .select({
      id: electricityBills.id,
      roomId: electricityBills.roomId,
      billingMonth: electricityBills.billingMonth,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      unitsConsumed: electricityBills.unitsConsumed,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
      totalPaise: electricityBills.totalPaise,
      prepaidCreditAppliedPaise: electricityBills.prepaidCreditAppliedPaise,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(electricityBills.id, billId))
    .limit(1);
  if (!bill) return null;

  const billingMonth = firstOfMonth(String(bill.billingMonth).slice(0, 10));
  const { drafts, occupants, allocation } = await loadCanonicalDrafts({
    roomId: bill.roomId,
    billingMonth,
    grossTotalPaise: bill.totalPaise,
    unitsConsumed: Number(bill.unitsConsumed),
    prepaidCreditPaise: bill.prepaidCreditAppliedPaise ?? 0,
  });
  void allocation;

  const invoiceRows = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      bookingId: electricityInvoices.bookingId,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(eq(electricityInvoices.electricityBillId, bill.id));

  const existingInvoices: ExistingElectricityInvoiceFact[] = invoiceRows.map((row) => ({
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    bookingId: row.bookingId,
    amountPaise: row.amountPaise,
    paidPaise: row.paidPaise ?? 0,
    status: row.status,
  }));

  const plan = planElectricityBillAllocationReconcile({
    roomTotalPaise: bill.totalPaise,
    canonicalLines: drafts,
    existingInvoices,
  });

  return {
    billId: bill.id,
    pgName: bill.pgName,
    roomId: bill.roomId,
    roomNumber: bill.roomNumber,
    billingMonth,
    previousReadingUnits: Number(bill.previousReadingUnits),
    currentReadingUnits: Number(bill.currentReadingUnits),
    unitsConsumed: Number(bill.unitsConsumed),
    ratePerUnitPaise: bill.ratePerUnitPaise,
    roomTotalPaise: bill.totalPaise,
    prepaidCreditAppliedPaise: bill.prepaidCreditAppliedPaise ?? 0,
    historicalResidents: drafts.map((d) => ({
      customerId: d.customerId,
      customerName: d.customerName,
      bookingId: d.bookingId,
      activeDays: d.activeDays,
      canonicalAmountPaise: d.amountPaise,
    })),
    existingInvoices,
    plan,
  };
}

export async function listElectricityBillsNeedingAllocationReconcile(
  billingMonth: string,
): Promise<ElectricityBillAllocationPreview[]> {
  const month = firstOfMonth(billingMonth);
  const bills = await db
    .select({ id: electricityBills.id })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.billingMonth, month),
        eq(electricityBills.isPipelineTest, false),
      ),
    );

  const out: ElectricityBillAllocationPreview[] = [];
  for (const bill of bills) {
    const preview = await previewElectricityBillAllocation(bill.id);
    if (!preview) continue;
    if (preview.plan.kind === 'noop') continue;
    out.push(preview);
  }
  return out.sort(
    (a, b) =>
      a.pgName.localeCompare(b.pgName) ||
      a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }),
  );
}

export async function repairElectricityBillAllocation(input: {
  billId: string;
  dryRun?: boolean;
  adminId?: string | null;
}): Promise<RepairElectricityBillAllocationResult> {
  const preview = await previewElectricityBillAllocation(input.billId);
  if (!preview) {
    return { ok: false, kind: 'not_found', message: `Bill ${input.billId} not found.` };
  }

  if (!preview.plan.ok) {
    return {
      ok: false,
      kind: 'paid_conflict',
      message: preview.plan.reasons.join(' '),
      preview,
    };
  }

  if (preview.plan.kind === 'noop') {
    return {
      ok: true,
      kind: 'noop',
      billId: preview.billId,
      cancelledInvoiceIds: [],
      updatedInvoiceIds: [],
      createdInvoiceIds: [],
      preservedInvoiceIds: preview.plan.preserve.map((p) => p.invoiceId),
      preview,
    };
  }

  if (input.dryRun) {
    return {
      ok: true,
      kind: 'reconciled',
      billId: preview.billId,
      cancelledInvoiceIds: preview.plan.cancel.map((c) => c.invoiceId),
      updatedInvoiceIds: preview.plan.update.map((u) => u.invoiceId),
      createdInvoiceIds: [],
      preservedInvoiceIds: preview.plan.preserve.map((p) => p.invoiceId),
      preview,
    };
  }

  const invoiceSchemaCaps = await getElectricityInvoiceSchemaCaps();
  const dueDateIso = formatDate(electricityDueDate(new Date()));
  const cancelledInvoiceIds: string[] = [];
  const updatedInvoiceIds: string[] = [];
  const createdInvoiceIds: string[] = [];

  const { drafts, occupants, allocation } = await loadCanonicalDrafts({
    roomId: preview.roomId,
    billingMonth: preview.billingMonth,
    grossTotalPaise: preview.roomTotalPaise,
    unitsConsumed: preview.unitsConsumed,
    prepaidCreditPaise: preview.prepaidCreditAppliedPaise,
  });
  void drafts;

  const invoiceAllocationByBooking = new Map(
    allocation.invoices
      .filter((line) => !line.excludedBecauseCheckoutPaid && line.amountPaise > 0)
      .map((line) => [line.bookingId, line.amountPaise]),
  );
  const residentInvoiceTotalPaise = allocation.invoices.reduce(
    (sum, line) => sum + (line.excludedBecauseCheckoutPaid ? 0 : line.amountPaise),
    0,
  );
  const contributionsLoad = await loadRoomElectricityContributionsForMonth(
    preview.roomId,
    preview.billingMonth,
  );

  let calculationBreakdown: Awaited<ReturnType<typeof composeElectricityBillBreakdown>> | null =
    null;
  try {
    calculationBreakdown = await composeElectricityBillBreakdown({
      roomId: preview.roomId,
      roomNumber: preview.roomNumber,
      billingMonth: preview.billingMonth,
      previousReadingUnits: preview.previousReadingUnits,
      currentReadingUnits: preview.currentReadingUnits,
      ratePerUnitPaise: preview.ratePerUnitPaise,
      grossTotalPaise: preview.roomTotalPaise,
      prepaidCreditPaise: allocation.prepaidCreditAppliedPaise,
      prepaidCreditNote: null,
      manualCreditPaise: allocation.manualCreditAppliedPaise,
      checkoutCreditAppliedPaise: allocation.checkoutCreditAppliedPaise,
      remainingBillPaise: residentInvoiceTotalPaise,
      useProRata: true,
      occupantLoad: occupants,
      invoiceAmountByBookingId: invoiceAllocationByBooking,
      allocation,
      previousContributions: contributionsLoad.contributions.map((row) => ({
        customerId: row.customerId,
        customerName: row.customerName,
        bookingId: row.bookingId,
        amountPaise: row.amountPaise,
        kind: row.kind,
        reason: row.reason,
        contributionDate: row.contributionDate,
        occupancyStart: row.occupancyStart,
        occupancyEnd: row.occupancyEnd,
      })),
    });
    assertElectricityBreakdownCommitReady({
      breakdown: calculationBreakdown,
      grossTotalPaise: preview.roomTotalPaise,
      invoiceTotalPaise: residentInvoiceTotalPaise,
    });
  } catch {
    calculationBreakdown = null;
  }

  try {
    await db.transaction(async (tx) => {
      if (calculationBreakdown) {
        await tx
          .update(electricityBills)
          .set({
            calculationBreakdown,
            monthlyOccupantCount: occupants.occupants.length,
            perResidentPaise: allocation.perResidentPaise,
            roundingRemainderPaise: allocation.remainderPaise,
            updatedAt: new Date(),
          })
          .where(eq(electricityBills.id, preview.billId));
      }

      for (const inv of preview.plan.cancel) {
        await tx
          .update(electricityInvoices)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(electricityInvoices.id, inv.invoiceId));
        cancelledInvoiceIds.push(inv.invoiceId);
      }

      for (const inv of preview.plan.update) {
        await tx
          .update(electricityInvoices)
          .set({
            amountPaise: inv.canonicalAmountPaise,
            activeDays: inv.activeDays,
            unitsShare: String(inv.unitsShare),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(electricityInvoices.id, inv.invoiceId),
              eq(electricityInvoices.status, 'pending'),
              sql`coalesce(${electricityInvoices.paidPaise}, 0) = 0`,
            ),
          );
        updatedInvoiceIds.push(inv.invoiceId);
      }

      for (const draft of preview.plan.create) {
        const existing = await findActiveElectricityInvoiceForResidentMonth({
          roomId: preview.roomId,
          billingMonth: preview.billingMonth,
          customerId: draft.customerId,
          executor: tx,
        });
        if (existing) {
          createdInvoiceIds.push(existing.id);
          continue;
        }

        let inserted: { id: string } | null = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const invoiceNumber = await nextElectricityInvoiceNumber(
            preview.billingMonth,
            attempt + createdInvoiceIds.length,
            tx,
          );
          const savepoint = `alloc_inv_${attempt}`;
          await tx.execute(sql.raw(`SAVEPOINT "${savepoint}"`));
          try {
            const invoiceValues = {
              invoiceNumber,
              electricityBillId: preview.billId,
              bookingId: draft.bookingId,
              customerId: draft.customerId,
              bedId: draft.bedId,
              billingMonth: preview.billingMonth,
              dueDate: dueDateIso,
              amountPaise: draft.amountPaise,
              unitsShare: draft.unitsShare.toString(),
              activeDays: draft.activeDays,
              status: 'pending' as const,
              ...(invoiceSchemaCaps.roomId ? { roomId: preview.roomId } : {}),
            };
            const [row] = await tx
              .insert(electricityInvoices)
              .values(invoiceValues as NewElectricityInvoice)
              .returning({ id: electricityInvoices.id });
            inserted = row;
            await tx.execute(sql.raw(`RELEASE SAVEPOINT "${savepoint}"`));
            break;
          } catch (err) {
            await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${savepoint}"`));
            if (pgErrorCode(err) === '23505') {
              const reused = await findActiveElectricityInvoiceForResidentMonth({
                roomId: preview.roomId,
                billingMonth: preview.billingMonth,
                customerId: draft.customerId,
                executor: tx,
              });
              if (reused) {
                inserted = { id: reused.id };
                break;
              }
              continue;
            }
            throw err;
          }
        }
        if (inserted) {
          createdInvoiceIds.push(inserted.id);
        }
      }

      await tx.insert(auditLog).values({
        actorType: input.adminId ? 'admin' : 'system',
        actorId: input.adminId ?? null,
        entity: 'electricity_bill',
        entityId: preview.billId,
        action: 'repair_allocation_reconcile',
        diff: {
          reason: 'BILL_AMOUNT_MISMATCH',
          billingMonth: preview.billingMonth,
          roomId: preview.roomId,
          roomNumber: preview.roomNumber,
          cancelledInvoiceIds,
          updatedInvoiceIds,
          createdInvoiceIds,
          preservedInvoiceIds: preview.plan.preserve.map((p) => p.invoiceId),
          reasons: preview.plan.reasons,
        },
      });
    });

    if (createdInvoiceIds.length > 0 || updatedInvoiceIds.length > 0) {
      const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
      await syncManyToUnified(
        [...createdInvoiceIds, ...updatedInvoiceIds],
        'electricity',
      ).catch(() => undefined);
    }
  } catch (err) {
    return {
      ok: false,
      kind: 'write_failed',
      message: err instanceof Error ? err.message : String(err),
      preview,
    };
  }

  const refreshed = await previewElectricityBillAllocation(preview.billId);
  return {
    ok: true,
    kind: 'reconciled',
    billId: preview.billId,
    cancelledInvoiceIds,
    updatedInvoiceIds,
    createdInvoiceIds,
    preservedInvoiceIds: preview.plan.preserve.map((p) => p.invoiceId),
    preview: refreshed ?? preview,
  };
}

export function formatAllocationReconcilePreviewSummary(
  previews: ElectricityBillAllocationPreview[],
): string {
  if (previews.length === 0) return 'No electricity allocation mismatches found.';
  const lines = [`Allocation reconcile candidates: ${previews.length}`];
  for (const p of previews) {
    lines.push(
      `  ${p.pgName} · Room ${p.roomNumber} · ${p.plan.code} · ` +
        `cancel ${p.plan.cancel.length} · update ${p.plan.update.length} · create ${p.plan.create.length} · ` +
        `canonical ${paiseToInr(p.plan.canonicalAllocationPaise)}`,
    );
    for (const c of p.plan.cancel) {
      lines.push(`    CANCEL ${c.customerName ?? c.customerId} ${c.invoiceNumber} ${paiseToInr(c.amountPaise)}`);
    }
    for (const u of p.plan.update) {
      lines.push(
        `    UPDATE ${u.customerName ?? u.customerId} ${u.invoiceNumber} ` +
          `${paiseToInr(u.amountPaise)} → ${paiseToInr(u.canonicalAmountPaise)}`,
      );
    }
    for (const c of p.plan.create) {
      lines.push(`    CREATE ${c.customerName ?? c.customerId} ${paiseToInr(c.amountPaise)}`);
    }
  }
  return lines.join('\n');
}
