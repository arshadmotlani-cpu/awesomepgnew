/**
 * June 2026 electricity integrity repair — audit, void incorrect bills, regenerate, certify.
 */
import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rentInvoices,
  residentBillingProfiles,
  rooms,
} from '@/src/db/schema';
import { DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE } from '@/src/lib/billing/constants';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { paiseToInr } from '@/src/lib/format';
import { loadBedPrice } from '@/src/services/pricing';
import {
  ROOM_SPECS,
  type RoomContext,
} from '@/src/services/generateJune2026ElectricityBills';
import { createElectricityBill, voidRoomElectricityBillsForMonth } from '@/src/services/electricityBilling';
import {
  auditElectricityInvoiceOwnership,
  repairMisassignedElectricityInvoices,
} from '@/src/services/electricityInvoiceOwnership';
import { getElectricitySettlementLedgerView } from '@/src/services/electricitySettlementLedgerView';
import { sumManualElectricityCreditsForRoomMonth } from '@/src/services/electricitySettlementLedgerView';
import { listCheckoutElectricityLedgerForRoomMonth } from '@/src/services/electricitySettlementLedger';
import { generateRentInvoiceForBookingAnniversary } from '@/src/services/rentInvoices';
import { listAnniversaryCandidates } from '@/src/services/billingScheduler';
import { monthBounds } from '@/src/services/billing';
import { formatDate } from '@/src/lib/dates';
import type { AdminSession } from '@/src/lib/auth/session';

const BILLING_MONTH = '2026-06-01';
const JULY_MONTH = '2026-07-01';
const RATE_PAISE = DEFAULT_ELECTRICITY_RATE_PER_UNIT_PAISE;

export type RoomCertification = {
  roomNumber: string;
  grossTotalPaise: number;
  collectedPaise: number;
  outstandingPaise: number;
  reconciliationGapPaise: number;
  balanced: boolean;
  residents: Array<{ name: string; amountPaise: number; invoiceNumber: string | null }>;
};

export type IntegrityRepairReport = {
  removedInvalidInvoices: string[];
  removedInvalidResidents: string[];
  regeneratedRooms: string[];
  julyRentInvoices: string[];
  rooms: RoomCertification[];
  overallPass: boolean;
};

async function resolveRoom(pgQuery: string, roomNumber: string) {
  const [row] = await db
    .select({ roomId: rooms.id, roomNumber: rooms.roomNumber, pgName: pgs.name, pgId: pgs.id })
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

function grossForSpec(spec: (typeof ROOM_SPECS)[number]): number {
  const units = spec.currentReadingUnits - spec.previousReadingUnits;
  return Math.round(units * RATE_PAISE);
}

async function expectedAllocation(roomId: string, spec: (typeof ROOM_SPECS)[number]) {
  const gross = grossForSpec(spec);
  const [room] = await db
    .select({ prepaidCreditPaise: rooms.electricityPrepaidCreditPaise })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  const checkoutRows = await listCheckoutElectricityLedgerForRoomMonth(roomId, BILLING_MONTH, {
    status: 'collected',
  });
  const checkoutCollectedByCustomerId = new Map<string, number>();
  for (const row of checkoutRows) {
    checkoutCollectedByCustomerId.set(
      row.customerId,
      (checkoutCollectedByCustomerId.get(row.customerId) ?? 0) + row.amountPaise,
    );
  }

  const manualCreditPaise = await sumManualElectricityCreditsForRoomMonth(roomId, BILLING_MONTH);
  const { occupants, totalWeight } = await loadRoomElectricityOccupantsForMonth({
    roomId,
    billingMonth: BILLING_MONTH,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });

  return allocateMonthlyElectricityInvoices({
    grossTotalPaise: gross,
    prepaidCreditPaise: room?.prepaidCreditPaise ?? 0,
    manualCreditPaise,
    occupants,
    checkoutCollectedByCustomerId,
    useProRata: totalWeight > 0,
  });
}

async function roomNeedsRegeneration(
  roomId: string,
  spec: (typeof ROOM_SPECS)[number],
): Promise<{ needs: boolean; reason: string }> {
  const gross = grossForSpec(spec);
  const [bill] = await db
    .select({ id: electricityBills.id, totalPaise: electricityBills.totalPaise })
    .from(electricityBills)
    .where(and(eq(electricityBills.roomId, roomId), eq(electricityBills.billingMonth, BILLING_MONTH)))
    .limit(1);

  if (!bill) return { needs: true, reason: 'missing bill' };
  if (bill.totalPaise !== gross) {
    return { needs: true, reason: `bill total ${paiseToInr(bill.totalPaise)} != ${paiseToInr(gross)}` };
  }

  const expected = await expectedAllocation(roomId, spec);
  const invoices = await db
    .select({
      customerId: electricityInvoices.customerId,
      customerName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityInvoices.electricityBillId, bill.id),
        sql`${electricityInvoices.status} <> 'cancelled'`,
      ),
    );

  const expectedByCustomer = new Map(
    expected.invoices
      .filter((i) => !i.excludedBecauseCheckoutPaid && i.amountPaise > 0)
      .map((i) => [i.customerId, i.amountPaise]),
  );

  for (const inv of invoices) {
    const exp = expectedByCustomer.get(inv.customerId);
    if (exp == null) {
      return { needs: true, reason: `unexpected invoice for ${inv.customerName}` };
    }
    if (exp !== inv.amountPaise) {
      return {
        needs: true,
        reason: `${inv.customerName} ${paiseToInr(inv.amountPaise)} != expected ${paiseToInr(exp)}`,
      };
    }
    expectedByCustomer.delete(inv.customerId);
  }
  if (expectedByCustomer.size > 0) {
    return { needs: true, reason: 'missing expected resident invoice(s)' };
  }

  const ownership = await auditElectricityInvoiceOwnership(BILLING_MONTH, { roomNumber: spec.roomNumber });
  if (ownership.flaggedCount > 0) {
    return { needs: true, reason: `${ownership.flaggedCount} ownership flag(s)` };
  }

  return { needs: false, reason: 'ok' };
}

async function certifyRoom(roomId: string, roomNumber: string, pgName: string): Promise<RoomCertification> {
  const spec = ROOM_SPECS.find((s) => s.roomNumber === roomNumber)!;
  const gross = grossForSpec(spec);
  const ledger = await getElectricitySettlementLedgerView({
    roomId,
    billingMonth: BILLING_MONTH,
    fallbackTotalBillPaise: gross,
  });

  const invoices = await db
    .select({
      customerName: customers.fullName,
      amountPaise: electricityInvoices.amountPaise,
      paidPaise: electricityInvoices.paidPaise,
      invoiceNumber: electricityInvoices.invoiceNumber,
      status: electricityInvoices.status,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .innerJoin(customers, eq(customers.id, electricityInvoices.customerId))
    .where(
      and(
        eq(electricityBills.roomId, roomId),
        eq(electricityBills.billingMonth, BILLING_MONTH),
        sql`${electricityInvoices.status} <> 'cancelled'`,
        sql`${electricityInvoices.amountPaise} > 0`,
      ),
    );

  const collected =
    (ledger?.checkoutSettlementTotalPaise ?? 0) +
    (ledger?.manualCreditsTotalPaise ?? 0) +
    invoices.reduce((s, i) => s + i.paidPaise, 0);
  const outstanding = invoices.reduce((s, i) => s + Math.max(0, i.amountPaise - i.paidPaise), 0);

  return {
    roomNumber,
    grossTotalPaise: gross,
    collectedPaise: collected,
    outstandingPaise: outstanding,
    reconciliationGapPaise: ledger?.reconciliationGapPaise ?? 0,
    balanced: ledger?.isBalanced ?? false,
    residents: invoices.map((i) => ({
      name: i.customerName,
      amountPaise: i.amountPaise,
      invoiceNumber: i.invoiceNumber,
    })),
  };
}

async function syncShantinagarBillingProfilesFromBedPrices(pgQuery = 'shanti'): Promise<number> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      bedId: beds.id,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        ilike(pgs.name, `%${pgQuery}%`),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        eq(bookings.status, 'confirmed'),
      ),
    );

  let updated = 0;
  for (const row of rows) {
    const rate = await loadBedPrice(row.bedId, JULY_MONTH);
    if (!rate || rate.monthlyRatePaise <= 0) continue;
    await db
      .update(residentBillingProfiles)
      .set({ rentAmountPaise: rate.monthlyRatePaise, updatedAt: new Date() })
      .where(eq(residentBillingProfiles.bookingId, row.bookingId));
    updated += 1;
  }
  return updated;
}

export async function runJuneElectricityIntegrityRepair(input: {
  session: AdminSession;
  pgQuery?: string;
  dryRun?: boolean;
  onLog?: (line: string) => void;
}): Promise<IntegrityRepairReport> {
  const pgQuery = input.pgQuery ?? 'shanti';
  const dryRun = input.dryRun ?? false;
  const log = input.onLog ?? ((line: string) => console.log(line));

  const report: IntegrityRepairReport = {
    removedInvalidInvoices: [],
    removedInvalidResidents: [],
    regeneratedRooms: [],
    julyRentInvoices: [],
    rooms: [],
    overallPass: false,
  };

  log('=== June 2026 electricity integrity repair ===');

  const room203 = await resolveRoom(pgQuery, '203');
  if (room203) {
    const harshadRows = await db
      .select({ id: customers.id, fullName: customers.fullName })
      .from(customers)
      .where(sql`${customers.fullName} ILIKE '%harshad%'`);
    const { traceElectricityInvoiceCausation } = await import(
      '@/src/lib/billing/roomElectricityOccupants'
    );
    for (const cust of harshadRows) {
      const causation = await traceElectricityInvoiceCausation({
        roomId: room203.roomId,
        billingMonth: BILLING_MONTH,
        customerId: cust.id,
      });
      if (causation?.invoiceNumber) {
        log(`Harshad causation: ${causation.causationSummary}`);
        report.removedInvalidResidents.push(
          `${cust.fullName}: ${causation.causationSummary}`,
        );
      }
    }
  }

  const ownershipBefore = await auditElectricityInvoiceOwnership(BILLING_MONTH, {
    pgNamePattern: pgQuery,
  });
  for (const row of ownershipBefore.rows.filter((r) => r.flags.length > 0)) {
    report.removedInvalidResidents.push(`${row.residentName} (Room ${row.roomNumber})`);
  }

  if (!dryRun) {
    const repair = await repairMisassignedElectricityInvoices(input.session, BILLING_MONTH, {
      pgNamePattern: pgQuery,
    });
    report.removedInvalidInvoices.push(...repair.cancelled);
    for (const r of repair.reassigned) {
      report.removedInvalidInvoices.push(`${r.invoiceNumber}: ${r.from} → ${r.to}`);
    }
  }

  for (const spec of ROOM_SPECS) {
    const resolved = await resolveRoom(pgQuery, spec.roomNumber);
    if (!resolved) throw new Error(`Room ${spec.roomNumber} not found`);

    const check = await roomNeedsRegeneration(resolved.roomId, spec);
    log(`Room ${spec.roomNumber}: ${check.reason}`);

    if (check.needs) {
      if (!dryRun) {
        const ctx: RoomContext = {
          roomId: resolved.roomId,
          roomNumber: spec.roomNumber,
          pgName: resolved.pgName,
          billingMonth: BILLING_MONTH,
          dryRun: false,
        };
        if (spec.prepare) await spec.prepare(ctx);
        await voidRoomElectricityBillsForMonth(resolved.roomId, BILLING_MONTH);
        const result = await createElectricityBill({
          roomId: resolved.roomId,
          billingMonth: BILLING_MONTH,
          previousReadingUnits: spec.previousReadingUnits,
          currentReadingUnits: spec.currentReadingUnits,
          ratePerUnitPaise: RATE_PAISE,
          useProRataByActiveDays: true,
          includeFixedStayOccupants: true,
          notes: 'June 2026 integrity repair',
        });
        if (!result.ok && result.kind !== 'already_exists') {
          throw new Error(`Room ${spec.roomNumber} regenerate failed: ${result.kind}`);
        }
        report.regeneratedRooms.push(spec.roomNumber);
      } else {
        report.regeneratedRooms.push(`${spec.roomNumber} (dry-run)`);
      }
    }

    report.rooms.push(await certifyRoom(resolved.roomId, spec.roomNumber, resolved.pgName));
  }

  log('\n=== July 2026 rent (Shantinagar, new bed pricing) ===');
  const profilesUpdated = dryRun ? 0 : await syncShantinagarBillingProfilesFromBedPrices(pgQuery);
  log(`Billing profiles synced from bed_prices: ${profilesUpdated}`);

  const { start: julyStart, end: julyEnd } = monthBounds(JULY_MONTH);
  let d = julyStart;
  while (d < julyEnd) {
    const runDate = formatDate(d);
    const candidates = await listAnniversaryCandidates(runDate);
    for (const c of candidates) {
      const [pgRow] = await db
        .select({ pgName: pgs.name })
        .from(bedReservations)
        .innerJoin(beds, eq(beds.id, bedReservations.bedId))
        .innerJoin(rooms, eq(rooms.id, beds.roomId))
        .innerJoin(floors, eq(floors.id, rooms.floorId))
        .innerJoin(pgs, eq(pgs.id, floors.pgId))
        .where(and(eq(bedReservations.bookingId, c.bookingId), eq(bedReservations.status, 'active')))
        .limit(1);
      if (!pgRow?.pgName.toLowerCase().includes('shanti')) continue;

      const [existing] = await db
        .select({ id: rentInvoices.id, invoiceNumber: rentInvoices.invoiceNumber })
        .from(rentInvoices)
        .where(
          and(
            eq(rentInvoices.bookingId, c.bookingId),
            eq(rentInvoices.billingMonth, JULY_MONTH),
            eq(rentInvoices.isAdhoc, false),
          ),
        )
        .limit(1);
      if (existing) {
        report.julyRentInvoices.push(`${existing.invoiceNumber} (exists)`);
        continue;
      }
      if (!dryRun) {
        const result = await generateRentInvoiceForBookingAnniversary({
          bookingId: c.bookingId,
          billingMonth: JULY_MONTH,
        });
        if (result.ok && result.created && result.invoiceNumber) {
          report.julyRentInvoices.push(result.invoiceNumber);
        }
      }
    }
    d = new Date(d.getTime() + 86_400_000);
  }

  report.overallPass = report.rooms.every(
    (r) => r.balanced && r.reconciliationGapPaise === 0 && r.grossTotalPaise > 0,
  );

  return report;
}

export function formatIntegrityRepairReport(report: IntegrityRepairReport): string {
  const lines: string[] = [];
  for (const room of report.rooms) {
    lines.push(`\nROOM ${room.roomNumber}`);
    lines.push('Residents billed:');
    if (room.residents.length === 0) lines.push('  (none — fully collected at checkout)');
    for (const r of room.residents) {
      lines.push(`  · ${r.name}: ${paiseToInr(r.amountPaise)}${r.invoiceNumber ? ` (${r.invoiceNumber})` : ''}`);
    }
    lines.push(`✓ Total room bill: ${paiseToInr(room.grossTotalPaise)}`);
    lines.push(`✓ Total collected: ${paiseToInr(room.collectedPaise)}`);
    lines.push(`✓ Total outstanding: ${paiseToInr(room.outstandingPaise)}`);
    lines.push(room.balanced && room.reconciliationGapPaise === 0 ? '✓ Ledger reconciles' : '✗ Ledger GAP');
  }
  lines.push('\nRemoved invalid invoices:');
  for (const x of report.removedInvalidInvoices) lines.push(`  · ${x}`);
  lines.push('\nRemoved invalid residents:');
  for (const x of report.removedInvalidResidents) lines.push(`  · ${x}`);
  lines.push('\nRegenerated invoices:');
  for (const x of report.regeneratedRooms) lines.push(`  · Room ${x}`);
  lines.push('\nJuly rent invoices generated:');
  for (const x of report.julyRentInvoices) lines.push(`  · ${x}`);
  lines.push(`\n${report.overallPass ? 'OVERALL PASS' : 'OVERALL FAIL'}`);
  return lines.join('\n');
}
