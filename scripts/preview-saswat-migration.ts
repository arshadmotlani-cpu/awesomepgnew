#!/usr/bin/env npx tsx
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('preview-saswat-migration.ts');
import { closeDb, db } from '../src/db/client';
import { bookings } from '../src/db/schema';
import { previewBillingCycleMigration } from '../src/services/billingCycleMigration';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';
import { paiseToInr } from '../src/lib/format';

async function main() {
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, 'APG-2026-0094')).limit(1);
  const p = await previewBillingCycleMigration(bk!.id);
  if ('ok' in p && p.ok === false) {
    console.log('error', p.error);
    return;
  }
  const m = await getBookingMoneyBalances(bk!.id);
  console.log('paidThrough', p.paidThroughDate);
  console.log('transition', p.transition);
  console.log('outstanding', paiseToInr(m?.rent.outstandingPaise ?? 0));
}
main().then(() => closeDb());
