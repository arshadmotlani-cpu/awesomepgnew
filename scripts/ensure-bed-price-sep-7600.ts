/**
 * Idempotent: ensure Room 101 B1 has ₹7,600/month effective 2026-09-01.
 * Does NOT alter historical rates used on 2026-08-31 room-change quote.
 *
 * Usage: DRY_RUN=1 npx tsx scripts/ensure-bed-price-sep-7600.ts
 *        npx tsx scripts/ensure-bed-price-sep-7600.ts
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bedPrices, beds, bookings, roomChangeRequests, rooms } from '@/src/db/schema';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl();

const BOOKING_CODE = 'APG-2026-0021';
const EFFECTIVE_FROM = '2026-09-01';
const MONTHLY_PAISE = 760_000;
const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  const [row] = await db
    .select({ toBedId: roomChangeRequests.toBedId })
    .from(roomChangeRequests)
    .innerJoin(bookings, eq(bookings.id, roomChangeRequests.bookingId))
    .where(eq(bookings.bookingCode, BOOKING_CODE))
    .orderBy(desc(roomChangeRequests.createdAt))
    .limit(1);
  if (!row) throw new Error('Room change not found');

  const [existing] = await db
    .select()
    .from(bedPrices)
    .where(
      and(
        eq(bedPrices.bedId, row.toBedId),
        eq(bedPrices.effectiveFrom, EFFECTIVE_FROM),
      ),
    )
    .limit(1);

  if (existing && existing.monthlyRatePaise === MONTHLY_PAISE) {
    const [staleWindow] = await db
      .select({ id: bedPrices.id })
      .from(bedPrices)
      .where(
        and(
          eq(bedPrices.bedId, row.toBedId),
          eq(bedPrices.effectiveTo, '2026-08-31'),
        ),
      )
      .limit(1);
    if (staleWindow && !DRY_RUN) {
      await db
        .update(bedPrices)
        .set({ effectiveTo: EFFECTIVE_FROM, updatedAt: new Date() })
        .where(eq(bedPrices.id, staleWindow.id));
    }
    console.log(JSON.stringify({ ok: true, action: 'already_set', bedId: row.toBedId }));
    return;
  }

  if (DRY_RUN) {
    console.log(
      JSON.stringify({
        dryRun: true,
        wouldInsert: !existing,
        wouldUpdate: Boolean(existing && existing.monthlyRatePaise !== MONTHLY_PAISE),
        bedId: row.toBedId,
        monthlyPaise: MONTHLY_PAISE,
        effectiveFrom: EFFECTIVE_FROM,
      }),
    );
    return;
  }

  const [openPrior] = await db
    .select({ id: bedPrices.id, effectiveFrom: bedPrices.effectiveFrom })
    .from(bedPrices)
    .where(and(eq(bedPrices.bedId, row.toBedId), isNull(bedPrices.effectiveTo)))
    .limit(1);

  if (openPrior && openPrior.effectiveFrom < EFFECTIVE_FROM) {
    await db
      .update(bedPrices)
      .set({ effectiveTo: EFFECTIVE_FROM, updatedAt: new Date() })
      .where(eq(bedPrices.id, openPrior.id));
  }

  if (existing) {
    await db
      .update(bedPrices)
      .set({ monthlyRatePaise: MONTHLY_PAISE, updatedAt: new Date() })
      .where(eq(bedPrices.id, existing.id));
    console.log(JSON.stringify({ ok: true, action: 'updated', bedId: row.toBedId }));
    return;
  }

  const [bedCtx] = await db
    .select({ bedCode: beds.bedCode, roomNumber: rooms.roomNumber })
    .from(beds)
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(eq(beds.id, row.toBedId))
    .limit(1);

  await db.insert(bedPrices).values({
    bedId: row.toBedId,
    monthlyRatePaise: MONTHLY_PAISE,
    dailyRatePaise: Math.floor(MONTHLY_PAISE / 30),
    weeklyRatePaise: Math.floor((MONTHLY_PAISE * 7) / 30),
    securityDepositPaise: MONTHLY_PAISE,
    monthlySecurityDepositPaise: MONTHLY_PAISE,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo: null,
  });

  console.log(
    JSON.stringify({
      ok: true,
      action: 'inserted',
      bedId: row.toBedId,
      room: bedCtx?.roomNumber,
      bed: bedCtx?.bedCode,
    }),
  );
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
