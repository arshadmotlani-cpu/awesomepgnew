#!/usr/bin/env npx tsx
/**
 * Preview July (or any month) anniversary rent generation before running it.
 *
 *   npx tsx scripts/preview-july-rent-generation.ts
 *   npx tsx scripts/preview-july-rent-generation.ts --month 2026-07
 *   npx tsx scripts/preview-july-rent-generation.ts --month 2026-07 --approve
 */
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';
loadScriptEnv();
import { and, eq, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import { bedReservations, beds, customers, rentInvoices, rooms } from '@/src/db/schema';
import {
  billingMonthForAnniversaryDate,
  dueDateForBillingDay,
  firstOfMonth,
  prorateForMonth,
} from '@/src/services/billing';
import { listAnniversaryCandidates } from '@/src/services/billingScheduler';
import {
  getRoomBillingConfigForBed,
  resolvePrivateRoomRentPaise,
  shouldSkipPrivateRoomDuplicate,
} from '@/src/lib/billing/roomBilling';
import { ensureBillingProfileForBooking } from '@/src/services/residentBillingProfiles';
import { generateRentInvoiceForBookingAnniversary } from '@/src/services/rentInvoices';
import { addDays, formatDate } from '@/src/lib/dates';

function parseArgs() {
  const monthIdx = process.argv.indexOf('--month');
  const raw = monthIdx >= 0 ? (process.argv[monthIdx + 1] ?? '2026-07') : '2026-07';
  const billingMonth = firstOfMonth(raw.includes('-') && raw.length <= 7 ? `${raw}-01` : raw);
  const approve = process.argv.includes('--approve');
  return { billingMonth, approve };
}

function monthDays(billingMonth: string): string[] {
  const [y, m] = billingMonth.split('-').map(Number);
  const days: string[] = [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d += 1) {
    days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

async function loadStayWindow(bookingId: string) {
  const [row] = await db.execute<{ start: string; end: string | null }>(sql`
    SELECT lower(br.stay_range)::text AS start,
           upper(br.stay_range)::text AS end
    FROM bed_reservations br
    WHERE br.booking_id = ${bookingId}::uuid
      AND br.status = 'active'
    ORDER BY lower(br.stay_range)
    LIMIT 1
  `);
  return row ?? null;
}

async function loadRoomLabel(bedId: string) {
  const [row] = await db
    .select({ roomNumber: rooms.roomNumber, bedCode: beds.bedCode })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(beds.id, bedId))
    .limit(1);
  return row ? `Room ${row.roomNumber} ${row.bedCode}` : bedId;
}

type PreviewRow = {
  bookingId: string;
  customerId: string;
  resident: string;
  room: string;
  billingDate: string;
  billingMonth: string;
  amountPaise: number;
  amountInr: string;
  skipReason?: string;
  existingInvoice?: boolean;
};

async function buildPreview(billingMonth: string): Promise<PreviewRow[]> {
  const byBooking = new Map<string, PreviewRow>();

  for (const runDate of monthDays(billingMonth)) {
    if (billingMonthForAnniversaryDate(runDate) !== billingMonth) continue;
    const candidates = await listAnniversaryCandidates(runDate);
    for (const c of candidates) {
      if (byBooking.has(c.bookingId)) continue;

      const [customer] = await db
        .select({ fullName: customers.fullName })
        .from(customers)
        .where(eq(customers.id, c.customerId))
        .limit(1);

      const [bedRow] = await db
        .select({ bedId: bedReservations.bedId })
        .from(bedReservations)
        .where(and(eq(bedReservations.bookingId, c.bookingId), eq(bedReservations.status, 'active')))
        .limit(1);

      const bedId = bedRow?.bedId;
      if (!bedId) continue;

      const profile = await ensureBillingProfileForBooking(c.bookingId);
      let rentPaise = profile?.rentAmountPaise ?? 0;
      const roomConfig = await getRoomBillingConfigForBed(bedId);
      let skipReason: string | undefined;

      if (roomConfig?.billingMode === 'private_room') {
        const dup = await shouldSkipPrivateRoomDuplicate({
          roomId: roomConfig.roomId,
          billingMonth,
          bookingId: c.bookingId,
          bedId,
        });
        if (dup.skip) {
          skipReason = dup.reason;
        } else {
          rentPaise = resolvePrivateRoomRentPaise(
            roomConfig,
            rentPaise,
            profile?.rentAmountPaise ?? 0,
          );
        }
      }

      const stay = await loadStayWindow(c.bookingId);
      const billingDay = profile?.billingDay ?? 5;
      const calendarDue = formatDate(dueDateForBillingDay(billingMonth, billingDay));

      const prorated =
        stay && !skipReason
          ? prorateForMonth({
              monthlyRatePaise: rentPaise,
              billingMonth,
              activeStart: stay.start,
              activeEnd: stay.end ?? '9999-12-31',
            })
          : { amountPaise: 0 };

      const [existing] = await db
        .select({ id: rentInvoices.id })
        .from(rentInvoices)
        .where(
          and(
            eq(rentInvoices.bookingId, c.bookingId),
            eq(rentInvoices.billingMonth, billingMonth),
            eq(rentInvoices.isAdhoc, false),
          ),
        )
        .limit(1);

      byBooking.set(c.bookingId, {
        bookingId: c.bookingId,
        customerId: c.customerId,
        resident: customer?.fullName ?? c.customerId,
        room: await loadRoomLabel(bedId),
        billingDate: runDate,
        billingMonth,
        amountPaise: skipReason ? 0 : prorated.amountPaise,
        amountInr: skipReason ? '—' : `₹${(prorated.amountPaise / 100).toLocaleString('en-IN')}`,
        skipReason,
        existingInvoice: Boolean(existing),
      });
    }
  }

  return [...byBooking.values()].sort((a, b) => a.billingDate.localeCompare(b.billingDate));
}

async function main() {
  const { billingMonth, approve } = parseArgs();
  console.log(`\n=== Rent generation preview — billing month ${billingMonth} ===\n`);

  const rows = await buildPreview(billingMonth);
  const toGenerate = rows.filter((r) => !r.skipReason && !r.existingInvoice && r.amountPaise > 0);

  console.log('| Resident | Room | Billing date | Amount | Status |');
  console.log('|----------|------|--------------|--------|--------|');
  for (const r of rows) {
    const status = r.skipReason
      ? `SKIP (${r.skipReason})`
      : r.existingInvoice
        ? 'EXISTS'
        : 'WILL GENERATE';
    console.log(`| ${r.resident} | ${r.room} | ${r.billingDate} | ${r.amountInr} | ${status} |`);
  }

  console.log(`\nTotal candidates: ${rows.length}`);
  console.log(`Will generate: ${toGenerate.length}`);
  console.log(`Skipped (private room / inventory): ${rows.filter((r) => r.skipReason).length}`);
  console.log(`Already invoiced: ${rows.filter((r) => r.existingInvoice).length}`);

  const room201 = rows.filter((r) => r.room.startsWith('Room 201'));
  if (room201.length) {
    console.log('\n--- Room 201 ---');
    for (const r of room201) {
      console.log(`  ${r.resident}: ${r.amountInr} (${r.skipReason ?? (r.existingInvoice ? 'exists' : 'generate')})`);
    }
  }

  if (!approve) {
    console.log('\nDry run only. Re-run with --approve to generate invoices.');
    await closeDb();
    return;
  }

  console.log('\nGenerating...\n');
  for (const r of toGenerate) {
    const result = await generateRentInvoiceForBookingAnniversary({
      bookingId: r.bookingId,
      billingMonth,
    });
    console.log(`  ${r.resident}: ${result.ok ? (result.created ? 'created' : 'skipped') : result.error}`);
  }

  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
