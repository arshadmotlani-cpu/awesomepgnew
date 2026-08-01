#!/usr/bin/env npx tsx
/**
 * Read-only audit of deposit payment_links in production.
 *   npx tsx scripts/audit-deposit-payment-links.ts
 *   npx tsx scripts/audit-deposit-payment-links.ts --json
 */
import { readFileSync } from 'node:fs';
import { and, eq, isNull, sql } from 'drizzle-orm';
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
import { bookings, customers, paymentLinks } from '@/src/db/schema';

type LinkRow = {
  id: string;
  residentId: string;
  residentName: string | null;
  bookingId: string | null;
  bookingCode: string | null;
  amount: number;
  status: string;
  createdAt: Date;
  depositDuePaise: number | null;
  depositCollectionStatus: string | null;
};

async function main() {
  const links = await db
    .select({
      id: paymentLinks.id,
      residentId: paymentLinks.residentId,
      residentName: customers.fullName,
      bookingId: paymentLinks.bookingId,
      bookingCode: bookings.bookingCode,
      amount: paymentLinks.amount,
      status: paymentLinks.status,
      createdAt: paymentLinks.createdAt,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
    })
    .from(paymentLinks)
    .leftJoin(customers, eq(customers.id, paymentLinks.residentId))
    .leftJoin(bookings, eq(bookings.id, paymentLinks.bookingId))
    .where(eq(paymentLinks.purpose, 'deposit'))
    .orderBy(paymentLinks.createdAt);

  const nullBookingId = links.filter((l) => l.bookingId == null);
  const active = links.filter((l) => l.status === 'active');

  const invalidBookingRefs = await db
    .select({
      id: paymentLinks.id,
      bookingId: paymentLinks.bookingId,
      residentName: customers.fullName,
    })
    .from(paymentLinks)
    .leftJoin(customers, eq(customers.id, paymentLinks.residentId))
    .where(
      and(
        eq(paymentLinks.purpose, 'deposit'),
        sql`${paymentLinks.bookingId} IS NOT NULL`,
        sql`NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = ${paymentLinks.bookingId})`,
      ),
    );

  const duplicateActiveByResident = await db.execute<{
    resident_id: string;
    resident_name: string | null;
    active_count: number;
    link_ids: string;
  }>(sql`
    SELECT pl.resident_id, c.full_name AS resident_name, COUNT(*)::int AS active_count,
           string_agg(pl.id::text, ', ' ORDER BY pl.created_at DESC) AS link_ids
    FROM payment_links pl
    LEFT JOIN customers c ON c.id = pl.resident_id
    WHERE pl.purpose = 'deposit' AND pl.status = 'active'
    GROUP BY pl.resident_id, c.full_name
    HAVING COUNT(*) > 1
  `);

  const duplicateActiveByBooking = await db.execute<{
    booking_id: string;
    booking_code: string | null;
    active_count: number;
    link_ids: string;
  }>(sql`
    SELECT pl.booking_id, b.booking_code, COUNT(*)::int AS active_count,
           string_agg(pl.id::text, ', ' ORDER BY pl.created_at DESC) AS link_ids
    FROM payment_links pl
    LEFT JOIN bookings b ON b.id = pl.booking_id
    WHERE pl.purpose = 'deposit' AND pl.status = 'active' AND pl.booking_id IS NOT NULL
    GROUP BY pl.booking_id, b.booking_code
    HAVING COUNT(*) > 1
  `);

  const bookingsWithDueAndNullLink = await db.execute<{
    booking_id: string;
    booking_code: string;
    customer_name: string;
    deposit_due_paise: number;
    latest_link_id: string | null;
    latest_link_booking_id: string | null;
  }>(sql`
    SELECT b.id AS booking_id, b.booking_code, c.full_name AS customer_name,
           b.deposit_due_paise,
           pl.id AS latest_link_id,
           pl.booking_id AS latest_link_booking_id
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    LEFT JOIN LATERAL (
      SELECT id, booking_id, status FROM payment_links
      WHERE resident_id = b.customer_id AND purpose = 'deposit'
      ORDER BY created_at DESC LIMIT 1
    ) pl ON true
    WHERE b.deposit_due_paise > 0
      AND b.status = 'confirmed'
      AND (pl.id IS NULL OR pl.booking_id IS DISTINCT FROM b.id OR pl.status != 'active')
  `);

  const report = {
    asOf: new Date().toISOString(),
    totals: {
      depositLinks: links.length,
      activeDepositLinks: active.length,
      nullBookingId: nullBookingId.length,
      invalidBookingRefs: invalidBookingRefs.length,
      duplicateActiveByResident: duplicateActiveByResident.length,
      duplicateActiveByBooking: duplicateActiveByBooking.length,
      bookingsWithDueAndMismatchedLink: bookingsWithDueAndNullLink.length,
    },
    nullBookingIdLinks: nullBookingId,
    invalidBookingRefs,
    duplicateActiveByResident,
    duplicateActiveByBooking,
    bookingsWithDueAndMismatchedLink: bookingsWithDueAndNullLink,
    govind: links.filter((l) => l.residentName?.toLowerCase().includes('govind')),
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('# Deposit payment_links audit');
    console.log(JSON.stringify(report.totals, null, 2));
    console.log('\n## NULL booking_id');
    for (const l of nullBookingId) {
      console.log(
        `- ${l.residentName} link=${l.id} amount=${l.amount} status=${l.status} created=${l.createdAt.toISOString()}`,
      );
    }
    console.log('\n## Bookings with deposit due but mismatched link');
    for (const r of bookingsWithDueAndNullLink) {
      console.log(JSON.stringify(r));
    }
    console.log('\n## Govind links');
    console.log(JSON.stringify(report.govind, null, 2));
  }

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
