/* eslint-disable no-console */
/**
 * Generate June 2026 electricity bills for Shanti Nagar rooms 101–204.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/generate-june-2026-electricity-bills.ts
 *   DATABASE_URL='…' npx tsx scripts/generate-june-2026-electricity-bills.ts --dry-run
 *   DATABASE_URL='…' npx tsx scripts/generate-june-2026-electricity-bills.ts --pg shanti
 *
 * Stops before generating if any room cannot reconcile exactly (rule 9).
 */
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  checkoutSettlements,
  customers,
  electricityBills,
  electricityInvoices,
  electricitySettlementLedger,
  floors,
  pgs,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { computeElectricitySettlementLedgerReconciliation } from '@/src/lib/billing/electricitySettlementLedgerReconciliation';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { createElectricityBill } from '@/src/services/electricityBilling';
import { firstOfMonth, monthBounds } from '@/src/services/billing';
import { listCheckoutElectricityLedgerForRoomMonth } from '@/src/services/electricitySettlementLedger';
import {
  getElectricitySettlementLedgerView,
  sumManualElectricityCreditsForRoomMonth,
} from '@/src/services/electricitySettlementLedgerView';
import { recordManualElectricityCredit } from '@/src/services/roomElectricityLedger';
import { repairElectricityInvoiceDuplicateGroup } from '@/src/services/electricityInvoiceDuplicates';
import { listElectricityInvoiceDuplicateGroups } from '@/src/services/electricityInvoiceDuplicates';
import { formatDate, parseDate, diffDays } from '@/src/lib/dates';

const BILLING_MONTH = '2026-06-01';
const RATE_PAISE = DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE; // ₹16/unit

type RoomSpec = {
  roomNumber: string;
  previousReadingUnits: number;
  currentReadingUnits: number;
  /** Room 101: dedupe bills / invoices before generate */
  dedupeBeforeGenerate?: boolean;
  /** Room-specific prep (manual credits, verification) */
  prepare?: (ctx: RoomContext) => Promise<void>;
};

type RoomContext = {
  roomId: string;
  roomNumber: string;
  pgName: string;
  billingMonth: string;
  dryRun: boolean;
};

const ROOM_SPECS: RoomSpec[] = [
  { roomNumber: '101', previousReadingUnits: 2008, currentReadingUnits: 2046, dedupeBeforeGenerate: true },
  { roomNumber: '102', previousReadingUnits: 205, currentReadingUnits: 241 },
  { roomNumber: '201', previousReadingUnits: 362, currentReadingUnits: 464 },
  { roomNumber: '202', previousReadingUnits: 506, currentReadingUnits: 661 },
  { roomNumber: '203', previousReadingUnits: 980, currentReadingUnits: 1267 },
  {
    roomNumber: '204',
    previousReadingUnits: 654,
    currentReadingUnits: 842,
    prepare: prepareRoom204,
  },
];

function paiseToInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function unitsConsumed(spec: RoomSpec): number {
  return Math.round((spec.currentReadingUnits - spec.previousReadingUnits) * 100) / 100;
}

function grossTotalPaise(spec: RoomSpec): number {
  return Math.round(unitsConsumed(spec) * RATE_PAISE);
}

async function resolveRoom(pgQuery: string, roomNumber: string) {
  const [row] = await db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      pgName: pgs.name,
      pgId: pgs.id,
    })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(rooms.roomNumber, roomNumber),
        ilike(pgs.name, `%${pgQuery}%`),
        isNull(pgs.archivedAt),
        isNull(rooms.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listBillsForRoomMonth(roomId: string, billingMonth: string) {
  return db
    .select({
      id: electricityBills.id,
      totalPaise: electricityBills.totalPaise,
      unitsConsumed: electricityBills.unitsConsumed,
      createdAt: electricityBills.createdAt,
    })
    .from(electricityBills)
    .where(
      and(
        eq(electricityBills.roomId, roomId),
        eq(electricityBills.billingMonth, billingMonth),
      ),
    )
    .orderBy(electricityBills.createdAt);
}

async function deleteElectricityBillById(billId: string): Promise<void> {
  await db.delete(electricityBills).where(eq(electricityBills.id, billId));
}

async function handleRoom101Dedup(ctx: RoomContext): Promise<'skip' | 'proceed'> {
  const bills = await listBillsForRoomMonth(ctx.roomId, ctx.billingMonth);

  if (bills.length === 0) {
    console.log(`  Room ${ctx.roomNumber}: no June bill — will generate.`);
    return 'proceed';
  }

  if (bills.length === 1) {
    console.log(`  Room ${ctx.roomNumber}: one bill exists (${bills[0]!.id}) — skip generation.`);
    return 'skip';
  }

  console.log(`  Room ${ctx.roomNumber}: ${bills.length} bills found — deleting duplicates (keep oldest).`);
  const toDelete = bills.slice(1);
  if (!ctx.dryRun) {
    for (const bill of toDelete) {
      await deleteElectricityBillById(bill.id);
      console.log(`    Deleted duplicate bill ${bill.id}`);
    }
  } else {
    for (const bill of toDelete) {
      console.log(`    [dry-run] Would delete bill ${bill.id}`);
    }
  }
  return 'proceed';
}

async function repairDuplicateInvoicesForRoom(
  roomId: string,
  billingMonth: string,
  dryRun: boolean,
): Promise<void> {
  const groups = await listElectricityInvoiceDuplicateGroups();
  const relevant = groups.filter(
    (g) => g.roomId === roomId && g.billingMonth === billingMonth,
  );
  if (relevant.length === 0) return;

  for (const group of relevant) {
    const keeper = [...group.invoices].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    )[0];
    if (!keeper) continue;
    console.log(
      `  Duplicate invoice group ${group.groupKey}: keep ${keeper.invoiceNumber}, cancel others`,
    );
    if (!dryRun) {
      const result = await repairElectricityInvoiceDuplicateGroup({
        keepInvoiceId: keeper.invoiceId,
        groupKey: group.groupKey,
        adminId: 'june-2026-batch-script',
      });
      if (!result.ok) {
        throw new Error(`Duplicate repair failed for ${group.groupKey}: ${result.error}`);
      }
      console.log(`    Cancelled: ${result.cancelledIds.join(', ')}`);
    }
  }
}

/** Room 204: first resident paid ₹500 but only ₹250 recorded — top up manual credit. */
async function prepareRoom204(ctx: RoomContext): Promise<void> {
  const TARGET_FIRST_RESIDENT_PAISE = 50_000; // ₹500

  const departedResidents = await db
    .select({
      customerId: checkoutSettlements.customerId,
      customerName: customers.fullName,
      bookingId: checkoutSettlements.bookingId,
      vacatingDate: vacatingRequests.vacatingDate,
      settlementId: checkoutSettlements.id,
    })
    .from(vacatingRequests)
    .innerJoin(checkoutSettlements, eq(checkoutSettlements.vacatingRequestId, vacatingRequests.id))
    .innerJoin(customers, eq(customers.id, checkoutSettlements.customerId))
    .innerJoin(bookings, eq(bookings.id, vacatingRequests.bookingId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, ctx.roomId),
        eq(bedReservations.kind, 'primary'),
        eq(vacatingRequests.vacatingDate, '2026-06-10'),
      ),
    )
    .limit(5);

  const june10 = departedResidents[0];
  if (june10) {
    const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(
      ctx.roomId,
      ctx.billingMonth,
      { status: 'collected' },
    );
    const checkoutForCustomer =
      checkoutRows.find((r) => r.customerId === june10.customerId)?.amountPaise ?? 0;
    const manualTotal = await sumManualElectricityCreditsForRoomMonth(
      ctx.roomId,
      ctx.billingMonth,
    );
    const recordedTotal = checkoutForCustomer + manualTotal;
    const shortfall = TARGET_FIRST_RESIDENT_PAISE - checkoutForCustomer;

    console.log(
      `  Room 204 — ${june10.customerName} (left ${june10.vacatingDate}): checkout ledger ${paiseToInr(checkoutForCustomer)}, manual ${paiseToInr(manualTotal)}`,
    );

    if (shortfall > 0) {
      console.log(
        `  Recording manual credit ${paiseToInr(shortfall)} for ${june10.customerName} (₹500 total contribution rule)`,
      );
      if (!ctx.dryRun) {
        await recordManualElectricityCredit({
          roomId: ctx.roomId,
          billingMonth: ctx.billingMonth,
          customerId: june10.customerId,
          bookingId: june10.bookingId,
          amountPaise: shortfall,
          source: 'manual',
          note: 'June 2026 batch: resident paid ₹500; system had ₹250 — top-up to ₹500 already collected',
        });
      }
    } else if (recordedTotal < TARGET_FIRST_RESIDENT_PAISE) {
      const gap = TARGET_FIRST_RESIDENT_PAISE - recordedTotal;
      console.log(`  Recording manual credit ${paiseToInr(gap)} to reach ₹500 total for first resident`);
      if (!ctx.dryRun) {
        await recordManualElectricityCredit({
          roomId: ctx.roomId,
          billingMonth: ctx.billingMonth,
          customerId: june10.customerId,
          bookingId: june10.bookingId,
          amountPaise: gap,
          source: 'manual',
          note: 'June 2026 batch: align to ₹500 already collected from first resident',
        });
      }
    }
  } else {
    console.warn('  Room 204: no resident found with vacating date 2026-06-10 — verify manually.');
  }

  const atifRows = await db
    .select({
      customerName: customers.fullName,
      amountPaise: electricitySettlementLedger.amountPaise,
      status: electricitySettlementLedger.status,
    })
    .from(electricitySettlementLedger)
    .innerJoin(customers, eq(customers.id, electricitySettlementLedger.customerId))
    .where(
      and(
        eq(electricitySettlementLedger.roomId, ctx.roomId),
        eq(electricitySettlementLedger.billingMonth, ctx.billingMonth),
        ilike(customers.fullName, '%atif%'),
      ),
    );
  if (atifRows.length === 0) {
    console.warn('  Room 204: Atif Siddiqui checkout electricity not found in settlement ledger — verify before generate.');
  } else {
    console.log(
      `  Room 204 — Atif: ${atifRows.map((r) => `${paiseToInr(r.amountPaise)} (${r.status})`).join(', ')} — will be excluded from new invoice`,
    );
  }
}

async function loadOccupantsForPreflight(roomId: string, billingMonth: string, useProRata: boolean) {
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const occupantRows = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      bedId: beds.id,
      lower: sql<string>`lower(${bedReservations.stayRange})::text`,
      upper: sql<string>`upper(${bedReservations.stayRange})::text`,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .where(
      and(
        eq(beds.roomId, roomId),
        sql`${bookings.status} IN ('confirmed', 'completed')`,
        sql`${bookings.durationMode} IN ('monthly', 'open_ended')`,
        eq(bedReservations.kind, 'primary'),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
      ),
    );

  const daysInMonth = diffDays(monthStart, monthEnd);
  const byBooking = new Map<
    string,
    { bookingId: string; customerId: string; bedIds: Set<string>; weight: number }
  >();

  for (const row of occupantRows) {
    const aStart = parseDate(row.lower);
    const aEnd = row.upper ? parseDate(row.upper) : monthEnd;
    const intersectStart = aStart > monthStart ? aStart : monthStart;
    const intersectEnd = aEnd < monthEnd ? aEnd : monthEnd;
    const bedDays =
      useProRata && intersectEnd > intersectStart
        ? diffDays(intersectStart, intersectEnd)
        : 1;

    const cur = byBooking.get(row.bookingId);
    if (cur) {
      cur.bedIds.add(row.bedId);
      cur.weight += bedDays;
    } else {
      byBooking.set(row.bookingId, {
        bookingId: row.bookingId,
        customerId: row.customerId,
        bedIds: new Set([row.bedId]),
        weight: bedDays,
      });
    }
  }

  return {
    occupants: [...byBooking.values()].map((bk) => ({
      bookingId: bk.bookingId,
      customerId: bk.customerId,
      bedCount: bk.bedIds.size,
      weight: bk.weight,
    })),
    totalWeight: [...byBooking.values()].reduce((s, b) => s + b.weight, 0),
    daysInMonth,
  };
}

async function preflightRoom(
  ctx: RoomContext,
  spec: RoomSpec,
): Promise<{ ok: true; preview: ReturnType<typeof allocateMonthlyElectricityInvoices> } | { ok: false; error: string }> {
  const gross = grossTotalPaise(spec);
  const [room] = await db
    .select({ prepaidCreditPaise: rooms.electricityPrepaidCreditPaise })
    .from(rooms)
    .where(eq(rooms.id, ctx.roomId))
    .limit(1);

  const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(
    ctx.roomId,
    ctx.billingMonth,
    { status: 'collected' },
  );
  const checkoutCollectedByCustomerId = new Map<string, number>();
  for (const row of checkoutRows) {
    const prev = checkoutCollectedByCustomerId.get(row.customerId) ?? 0;
    checkoutCollectedByCustomerId.set(row.customerId, prev + row.amountPaise);
  }

  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(
    ctx.roomId,
    ctx.billingMonth,
  );

  const { occupants, totalWeight } = await loadOccupantsForPreflight(
    ctx.roomId,
    ctx.billingMonth,
    true,
  );

  const allocation = allocateMonthlyElectricityInvoices({
    grossTotalPaise: gross,
    prepaidCreditPaise: room?.prepaidCreditPaise ?? 0,
    manualCreditPaise,
    occupants,
    checkoutCollectedByCustomerId,
    useProRata: totalWeight > 0,
  });

  const residentAllocationsPaise = allocation.invoices
    .filter((i) => !i.excludedBecauseCheckoutPaid)
    .reduce((s, i) => s + i.amountPaise, 0);

  const reconciliation = computeElectricitySettlementLedgerReconciliation({
    totalRoomBillPaise: gross,
    prepaidCreditAppliedPaise: allocation.prepaidCreditAppliedPaise,
    checkoutSettlementCreditsPaise: allocation.checkoutCreditAppliedPaise,
    manualCreditsPaise: allocation.manualCreditAppliedPaise,
    residentAllocationsPaise,
    roundingRemainderPaise: allocation.remainderPaise,
  });

  if (!reconciliation.isBalanced) {
    return {
      ok: false,
      error: `Reconciliation gap ${reconciliation.reconciliationGapPaise} paise (${paiseToInr(reconciliation.reconciliationGapPaise)}). Credits=${paiseToInr(reconciliation.totalCreditsPaise)}, invoices=${paiseToInr(residentAllocationsPaise)}, remainder=${paiseToInr(allocation.remainderPaise)}`,
    };
  }

  return { ok: true, preview: allocation };
}

async function printRoomSummary(ctx: RoomContext, spec: RoomSpec): Promise<void> {
  const gross = grossTotalPaise(spec);
  const ledger = await getElectricitySettlementLedgerView({
    roomId: ctx.roomId,
    billingMonth: ctx.billingMonth,
    fallbackTotalBillPaise: gross,
  });

  console.log('\n' + '═'.repeat(72));
  console.log(`ROOM ${ctx.roomNumber} · ${ctx.pgName} · June 2026`);
  console.log('═'.repeat(72));
  console.log(`Units consumed     : ${unitsConsumed(spec)}`);
  console.log(`Total bill         : ${paiseToInr(gross)}`);

  if (!ledger) {
    console.log('(No ledger view — bill may not exist yet)');
    return;
  }

  console.log(`Checkout collected : ${paiseToInr(ledger.checkoutSettlementTotalPaise)}`);
  for (const c of ledger.checkoutSettlementCredits) {
    console.log(`  · ${c.customerName}: ${paiseToInr(c.amountPaise)} (Already Collected)`);
  }
  console.log(`Manual credits     : ${paiseToInr(ledger.manualCreditsTotalPaise)}`);
  for (const c of ledger.manualCredits) {
    console.log(`  · ${c.customerName}: ${paiseToInr(c.amountPaise)} — ${c.note ?? c.source}`);
  }
  console.log(`Remaining balance  : ${paiseToInr(ledger.remainingRoomBalancePaise)}`);
  console.log(`Rounding remainder : ${paiseToInr(ledger.roundingRemainderPaise)}`);
  console.log(`Reconciliation gap : ${ledger.reconciliationGapPaise} (${ledger.isBalanced ? 'balanced' : 'UNBALANCED'})`);

  const invoices = ledger.residentAllocations.filter((a) => a.amountPaise > 0 || a.excludedBecauseCheckoutPaid);
  console.log('Resident allocations:');
  for (const inv of invoices) {
    if (inv.excludedBecauseCheckoutPaid) {
      console.log(`  · ${inv.customerName}: excluded (checkout already collected)`);
    } else {
      console.log(
        `  · ${inv.customerName}: ${paiseToInr(inv.amountPaise)} invoice ${inv.invoiceNumber ?? '(pending)'} [${inv.status}]`,
      );
    }
  }

  const activeInvoices = await db
    .select({
      invoiceNumber: electricityInvoices.invoiceNumber,
      customerName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityBills.roomId, ctx.roomId),
        eq(electricityBills.billingMonth, ctx.billingMonth),
        sql`${electricityInvoices.status} <> 'cancelled'`,
      ),
    )
    .orderBy(electricityInvoices.invoiceNumber);

  if (activeInvoices.length > 0) {
    console.log('Active invoices in DB:');
    for (const inv of activeInvoices) {
      console.log(`  · ${inv.invoiceNumber} · ${inv.customerName} · ${paiseToInr(inv.amountPaise)} · ${inv.status}`);
    }
  }
}

async function processRoom(
  pgQuery: string,
  spec: RoomSpec,
  dryRun: boolean,
): Promise<void> {
  const resolved = await resolveRoom(pgQuery, spec.roomNumber);
  if (!resolved) {
    throw new Error(`Room ${spec.roomNumber} not found for PG matching "${pgQuery}"`);
  }

  const ctx: RoomContext = {
    roomId: resolved.roomId,
    roomNumber: spec.roomNumber,
    pgName: resolved.pgName,
    billingMonth: BILLING_MONTH,
    dryRun,
  };

  console.log(`\n>>> Processing Room ${spec.roomNumber} (${resolved.pgName})`);

  if (spec.dedupeBeforeGenerate) {
    await repairDuplicateInvoicesForRoom(ctx.roomId, ctx.billingMonth, dryRun);
    const dedupeResult = await handleRoom101Dedup(ctx);
    if (dedupeResult === 'skip') {
      await printRoomSummary(ctx, spec);
      return;
    }
  } else {
    const existing = await listBillsForRoomMonth(ctx.roomId, ctx.billingMonth);
    if (existing.length >= 1) {
      console.log(`  Bill already exists (${existing[0]!.id}) — skip generation.`);
      await printRoomSummary(ctx, spec);
      return;
    }
  }

  if (spec.prepare) {
    await spec.prepare(ctx);
  }

  const preflight = await preflightRoom(ctx, spec);
  if (!preflight.ok) {
    throw new Error(`Room ${spec.roomNumber} preflight failed: ${preflight.error}`);
  }

  console.log('  Preflight reconciliation: OK');
  console.log(`  Checkout credit applied: ${paiseToInr(preflight.preview.checkoutCreditAppliedPaise)}`);
  console.log(`  Manual credit applied: ${paiseToInr(preflight.preview.manualCreditAppliedPaise)}`);
  console.log(`  Net splittable: ${paiseToInr(preflight.preview.netSplittablePaise)}`);
  for (const line of preflight.preview.invoices) {
    const [cust] = await db
      .select({ fullName: customers.fullName })
      .from(customers)
      .where(eq(customers.id, line.customerId))
      .limit(1);
    const label = cust?.fullName ?? line.customerId.slice(0, 8);
    if (line.excludedBecauseCheckoutPaid) {
      console.log(`    · ${label}: excluded (checkout)`);
    } else if (line.amountPaise > 0) {
      console.log(`    · ${label}: ${paiseToInr(line.amountPaise)}`);
    }
  }

  if (dryRun) {
    console.log('  [dry-run] Skipping createElectricityBill');
    await printRoomSummary(ctx, spec);
    return;
  }

  const result = await createElectricityBill({
    roomId: ctx.roomId,
    billingMonth: ctx.billingMonth,
    previousReadingUnits: spec.previousReadingUnits,
    currentReadingUnits: spec.currentReadingUnits,
    ratePerUnitPaise: RATE_PAISE,
    useProRataByActiveDays: true,
    notes: 'June 2026 batch generation',
  });

  if (!result.ok) {
    if (result.kind === 'already_exists') {
      console.log(`  Bill already exists: ${result.existingBillId}`);
    } else {
      throw new Error(`createElectricityBill failed: ${result.kind} — ${'message' in result ? result.message : ''}`);
    }
  } else {
    console.log(`  Created bill ${result.billId} with ${result.invoiceIds.length} invoice(s)`);
  }

  await printRoomSummary(ctx, spec);
}

export type GenerateJune2026Options = {
  dryRun?: boolean;
  pgQuery?: string;
  onLog?: (line: string) => void;
};

export async function runGenerateJune2026ElectricityBills(
  options: GenerateJune2026Options = {},
): Promise<void> {
  const dryRun = options.dryRun ?? false;
  const pgQuery = options.pgQuery ?? 'shanti';
  const log = options.onLog ?? ((line: string) => console.log(line));
  const prevLog = console.log;
  const prevErr = console.error;
  console.log = (...args: unknown[]) => log(args.map(String).join(' '));
  console.error = (...args: unknown[]) => log(`[stderr] ${args.map(String).join(' ')}`);

  try {
    log('June 2026 electricity bill batch');
    log(`PG filter: ${pgQuery}`);
    log(`Billing month: ${BILLING_MONTH}`);
    log(`Rate: ${paiseToInr(RATE_PAISE)} per unit`);
    log(dryRun ? 'MODE: dry-run (no writes)' : 'MODE: LIVE');

    for (const spec of ROOM_SPECS) {
      await processRoom(pgQuery, spec, dryRun);
    }

    log('\n✓ Batch complete.');
  } finally {
    console.log = prevLog;
    console.error = prevErr;
  }
}
