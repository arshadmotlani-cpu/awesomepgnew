#!/usr/bin/env npx tsx
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('simulate-sep-focus.ts');
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { evaluateAnniversaryRentGenerationEligibility } from '../src/services/rentInvoices';

async function main() {
  for (const code of ['APG-2026-0090', 'APG-2026-0094']) {
    const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, code)).limit(1);
    const e = await evaluateAnniversaryRentGenerationEligibility({
      bookingId: bk!.id,
      billingMonth: '2026-09-01',
      asOf: '2026-09-01',
      forceAll: false,
    });
    console.log(code, JSON.stringify({ eligible: e.eligible, skip: e.skipCode, rent: e.rentPaise }));
  }
}
main().then(() => closeDb());
