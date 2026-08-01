#!/usr/bin/env npx tsx
/**
 * Repair Govind's deposit payment links (production).
 * - Keeps the latest active link, sets booking_id
 * - Expires duplicate active deposit links for the same resident
 *
 *   npx tsx scripts/repair-govind-deposit-payment-link.ts --dry-run
 *   npx tsx scripts/repair-govind-deposit-payment-link.ts
 */
import { readFileSync } from 'node:fs';
import { and, desc, eq, ne } from 'drizzle-orm';
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';

function loadDatabaseUrlFromBackupFiles(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
      if (value && value.length > 10 && !value.includes('localhost')) {
        process.env.DATABASE_URL = value;
        return;
      }
    } catch {
      // try next
    }
  }
}

process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
loadScriptEnv();
loadDatabaseUrlFromBackupFiles();

import { db, closeDb } from '@/src/db/client';
import { auditLog, bookings, customers, paymentLinks } from '@/src/db/schema';

const GOVIND_BOOKING_ID = '43a5ce09-ddc3-4ddc-a7b9-f55db6d585e4';
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const [booking] = await db
    .select({
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      depositDuePaise: bookings.depositDuePaise,
      customerName: customers.fullName,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .where(eq(bookings.id, GOVIND_BOOKING_ID))
    .limit(1);

  if (!booking) {
    console.error('Govind booking not found');
    process.exit(1);
  }

  const activeLinks = await db
    .select()
    .from(paymentLinks)
    .where(
      and(
        eq(paymentLinks.residentId, booking.customerId),
        eq(paymentLinks.purpose, 'deposit'),
        eq(paymentLinks.status, 'active'),
      ),
    )
    .orderBy(desc(paymentLinks.createdAt));

  if (activeLinks.length === 0) {
    console.error('No active deposit links for Govind');
    process.exit(1);
  }

  const keep = activeLinks[0]!;
  const expire = activeLinks.slice(1);

  console.log('Booking', booking.bookingCode, 'deposit due', booking.depositDuePaise);
  console.log('Keep link', keep.id, 'amount', keep.amount, 'booking_id', keep.bookingId);
  console.log('Expire', expire.length, 'duplicate active links');

  if (dryRun) {
    console.log('DRY RUN — no changes written');
    await closeDb();
    return;
  }

  await db
    .update(paymentLinks)
    .set({ bookingId: GOVIND_BOOKING_ID })
    .where(eq(paymentLinks.id, keep.id));

  if (expire.length > 0) {
    await db
      .update(paymentLinks)
      .set({ status: 'expired' })
      .where(
        and(
          eq(paymentLinks.residentId, booking.customerId),
          eq(paymentLinks.purpose, 'deposit'),
          eq(paymentLinks.status, 'active'),
          ne(paymentLinks.id, keep.id),
        ),
      );
  }

  await db.insert(auditLog).values({
    actorType: 'system',
    actorId: null,
    entity: 'payment_link',
    entityId: keep.id,
    action: 'deposit_link_booking_repair',
    diff: {
      bookingId: GOVIND_BOOKING_ID,
      expiredDuplicateCount: expire.length,
      reason: 'ensureDepositDuePaymentLink omitted booking_id — Phase 1 cert repair',
    },
  });

  console.log('Repaired: kept', keep.id, 'with booking_id', GOVIND_BOOKING_ID);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
