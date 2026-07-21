/**
 * Repair room electricity for a billing month using historical contribution records.
 *
 * Usage:
 *   npx tsx scripts/repair-room-electricity.ts \
 *     --pg shanti --room 204 --month 2026-06-01 \
 *     --contribution bookingId1:1220:"Resident A offline payment" \
 *     --contribution bookingId2:500:"Resident B checkout period" \
 *     [--regenerate] [--dry-run]
 */
import { and, eq, ilike, ne } from 'drizzle-orm';
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
  rooms,
} from '@/src/db/schema';
import { firstOfMonth } from '@/src/services/billing';
import { createElectricityBill } from '@/src/services/electricityBilling';
import { recordHistoricalElectricityContribution } from '@/src/services/electricityRoomContributions';
import { loadRoomElectricityContributionsForMonth } from '@/src/services/electricityRoomContributions';
import { allocateMonthlyElectricityInvoices } from '@/src/lib/billing/roomElectricityMonthlyAllocation';
import { loadRoomElectricityOccupantsForMonth } from '@/src/lib/billing/roomElectricityOccupants';
import { countActiveBedsInRoom } from '@/src/lib/roomCapacitySsotDb';
import { paiseToInr } from '@/src/lib/format';

type ContributionArg = {
  bookingId: string;
  amountPaise: number;
  reason: string;
};

function parseArgs(argv: string[]) {
  let pgQuery = 'shanti';
  let roomNumber = '';
  let billingMonth = '';
  let dryRun = false;
  let regenerate = false;
  const contributions: ContributionArg[] = [];

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--regenerate') regenerate = true;
    else if (arg === '--pg') pgQuery = argv[++i] ?? pgQuery;
    else if (arg === '--room') roomNumber = argv[++i] ?? '';
    else if (arg === '--month') billingMonth = firstOfMonth(argv[++i] ?? '');
    else if (arg === '--contribution') {
      const raw = argv[++i] ?? '';
      const [bookingId, amountInr, ...reasonParts] = raw.split(':');
      const amountPaise = Math.round(Number(amountInr) * 100);
      if (!bookingId || !Number.isFinite(amountPaise) || amountPaise <= 0) {
        throw new Error(`Invalid --contribution: ${raw}`);
      }
      contributions.push({
        bookingId,
        amountPaise,
        reason: reasonParts.join(':') || 'Historical offline electricity payment',
      });
    }
  }

  if (!roomNumber || !billingMonth) {
    throw new Error('Required: --room and --month');
  }
  if (contributions.length === 0) {
    throw new Error('At least one --contribution bookingId:amountInr:reason is required');
  }

  return { pgQuery, roomNumber, billingMonth, dryRun, regenerate, contributions };
}

async function resolveRoom(pgQuery: string, roomNumber: string) {
  const [room] = await db
    .select({ roomId: rooms.id, pgName: pgs.name })
    .from(rooms)
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(and(ilike(pgs.slug, `%${pgQuery}%`), eq(rooms.roomNumber, roomNumber)))
    .limit(1);
  if (!room) throw new Error(`Room ${roomNumber} not found for PG ${pgQuery}`);
  return room;
}

async function main() {
  const args = parseArgs(process.argv);
  const room = await resolveRoom(args.pgQuery, args.roomNumber);
  console.log(`Repair ${room.pgName} room ${args.roomNumber} · ${args.billingMonth}`);

  for (const contribution of args.contributions) {
    const [booking] = await db
      .select({
        bookingId: bookings.id,
        customerId: bookings.customerId,
        customerName: customers.fullName,
      })
      .from(bookings)
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(eq(bookings.id, contribution.bookingId))
      .limit(1);
    if (!booking) throw new Error(`Booking ${contribution.bookingId} not found`);

    console.log(
      `  Contribution ${booking.customerName}: ${paiseToInr(contribution.amountPaise)} — ${contribution.reason}`,
    );
    if (!args.dryRun) {
      await recordHistoricalElectricityContribution({
        roomId: room.roomId,
        billingMonth: args.billingMonth,
        customerId: booking.customerId,
        bookingId: booking.bookingId,
        amountPaise: contribution.amountPaise,
        reason: contribution.reason,
        contributionDate: args.billingMonth,
      });
    }
  }

  const contributionsLoad = await loadRoomElectricityContributionsForMonth(
    room.roomId,
    args.billingMonth,
  );
  console.log(`  Total contributions: ${paiseToInr(contributionsLoad.totalPaise)}`);

  const [bill] = await db
    .select({
      id: electricityBills.id,
      totalPaise: electricityBills.totalPaise,
      previousReadingUnits: electricityBills.previousReadingUnits,
      currentReadingUnits: electricityBills.currentReadingUnits,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
    })
    .from(electricityBills)
    .where(
      and(eq(electricityBills.roomId, room.roomId), eq(electricityBills.billingMonth, args.billingMonth)),
    )
    .limit(1);

  if (!bill) {
    console.log('  No electricity bill exists yet — run month-end generation after repair.');
    return;
  }

  console.log(`  Gross room bill: ${paiseToInr(bill.totalPaise)}`);
  const remaining = Math.max(0, bill.totalPaise - contributionsLoad.totalPaise);
  console.log(`  Expected remaining: ${paiseToInr(remaining)}`);

  if (args.regenerate) {
    if (!args.dryRun) {
      await db
        .update(electricityInvoices)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(electricityInvoices.electricityBillId, bill.id),
            ne(electricityInvoices.status, 'cancelled'),
          ),
        );
      await db.delete(electricityBills).where(eq(electricityBills.id, bill.id));
    }
    console.log('  Cancelled existing invoices and bill — regenerating…');
    if (!args.dryRun) {
      const units = Number(bill.currentReadingUnits) - Number(bill.previousReadingUnits);
      await createElectricityBill({
        roomId: room.roomId,
        billingMonth: args.billingMonth,
        previousReadingUnits: Number(bill.previousReadingUnits),
        currentReadingUnits: Number(bill.currentReadingUnits),
        ratePerUnitPaise: bill.ratePerUnitPaise,
        useProRataByActiveDays: true,
        allowPreviousReadingOverride: true,
        includeFixedStayOccupants: true,
      });
    }
  }

  const occupantLoad = await loadRoomElectricityOccupantsForMonth({
    roomId: room.roomId,
    billingMonth: args.billingMonth,
    includeFixedStay: true,
    useProRataByActiveDays: true,
  });
  const preview = allocateMonthlyElectricityInvoices({
    grossTotalPaise: bill.totalPaise,
    prepaidCreditPaise: 0,
    contributionsByCustomerId: contributionsLoad.byCustomerId,
    occupants: occupantLoad.occupants,
    checkoutCollectedByCustomerId: new Map(),
    useProRata: true,
    activeBedCount: await countActiveBedsInRoom(room.roomId),
  });
  console.log('  Allocation preview:');
  for (const line of preview.invoices.filter((i) => i.amountPaise > 0)) {
    const name = contributionsLoad.contributions.find((c) => c.customerId === line.customerId)
      ?.customerName;
    console.log(`    ${name ?? line.customerId}: ${paiseToInr(line.amountPaise)}`);
  }
  console.log(
    contributionsLoad.totalPaise + preview.invoices.reduce((s, i) => s + i.amountPaise, 0) ===
      bill.totalPaise - preview.remainderPaise
      ? '  ✓ Room total reconciles'
      : '  ⚠ Reconciliation gap — review contributions and occupants',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
