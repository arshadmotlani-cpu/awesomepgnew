#!/usr/bin/env npx tsx
import { eq } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';
loadProductionAuditEnv();
requireDatabaseUrl('repair-saswat-overlap-production.ts');
import { closeDb, db } from '../src/db/client';
import { adminUsers, bookings } from '../src/db/schema';
import {
  cancelOverlappingBillingTransitionInvoices,
  previewBillingCycleMigration,
} from '../src/services/billingCycleMigration';
import { paiseToInr } from '../src/lib/format';
import { getBookingMoneyBalances } from '../src/services/bookingMoneyBalances';

async function main() {
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.role, 'super_admin')).limit(1);
  const session = {
    adminId: admin!.id,
    role: 'super_admin' as const,
    pgScope: null,
    email: admin!.email,
  };
  const [bk] = await db.select().from(bookings).where(eq(bookings.bookingCode, 'APG-2026-0094')).limit(1);
  const preview = await previewBillingCycleMigration(bk!.id);
  console.log('paidThrough', (preview as { paidThroughDate?: string }).paidThroughDate);
  const result = await cancelOverlappingBillingTransitionInvoices(
    session,
    bk!.id,
    'Overlapping prepaid anniversary coverage — Saswat billing correction',
  );
  console.log('cancel', result);
  const m = await getBookingMoneyBalances(bk!.id);
  console.log('outstanding', paiseToInr(m?.rent.outstandingPaise ?? 0));
}
main().then(() => closeDb());
