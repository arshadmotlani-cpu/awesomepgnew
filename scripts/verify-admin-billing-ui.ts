#!/usr/bin/env npx tsx
/**
 * Admin billing UI verification — resident profile display + Operations badge SSOT.
 *
 *   npx tsx scripts/verify-admin-billing-ui.ts
 */
import { loadScriptEnv } from '@/src/lib/scripts/loadScriptEnv';
loadScriptEnv();

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { closeDb, db } from '@/src/db/client';
import {
  actionItems,
  bedReservations,
  bookings,
  customers,
  rentInvoices,
  unresolvedActions,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import {
  mapUnresolvedActionRow,
  pickPrimaryUnresolvedAction,
} from '@/src/lib/residents/residentUnresolvedActions';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { syncActionItemsForCron } from '@/src/services/actionItems';
import { getResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';
import { loadMonthlyBillingSnapshotForBooking } from '@/src/lib/billing/monthlyBillingSnapshot';
import { loadResidentOperationsResidentsPage } from '@/src/services/residentOperationsResidentsPage';
import { getOpenActionsForResident } from '@/src/services/unresolvedActions';
import { formatDate } from '@/src/lib/dates';

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'verify-ui',
  adminId: 'verify-ui',
  email: 'verify@system',
  fullName: 'Verify UI',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

type Result = { name: string; pass: boolean; detail: string };

async function main() {
  const results: Result[] = [];
  const today = formatDate(new Date());

  await syncActionItemsForCron();

  // 1. Next rent due — active monthly residents show a future (or today) date
  const activeResidents = await db
    .select({
      customerId: customers.id,
      bookingId: bookings.id,
      fullName: customers.fullName,
    })
    .from(customers)
    .innerJoin(bookings, eq(bookings.customerId, customers.id))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(customers.residencyStatus, 'active'),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        notInArray(bookings.durationMode, ['fixed_stay', 'daily', 'weekly', 'reserve']),
      ),
    )
    .limit(50);

  let nextDueFails = 0;
  for (const r of activeResidents) {
    const defaults = await getResidentBillingFormDefaults(r.customerId, r.bookingId);
    if (!defaults) continue;
    if (defaults.nextRentDueDate < today) {
      nextDueFails += 1;
      console.error(
        `  FAIL next rent due for ${r.fullName}: ${defaults.nextRentDueDate} (today ${today})`,
      );
    }
  }
  results.push({
    name: 'Resident profile shows Next rent due correctly',
    pass: nextDueFails === 0,
    detail:
      nextDueFails === 0
        ? `${activeResidents.length} active monthly residents checked`
        : `${nextDueFails} residents with past nextRentDueDate`,
  });

  let snapshotBlankFails = 0;
  for (const r of activeResidents) {
    const snapshot = await loadMonthlyBillingSnapshotForBooking({
      bookingId: r.bookingId,
      customerId: r.customerId,
    });
    if (!snapshot) continue;
    if (
      snapshot.billingCycleLabel === '—' ||
      !snapshot.nextRentDueDate ||
      snapshot.billingPeriodLabel === '—'
    ) {
      snapshotBlankFails += 1;
      console.error(`  FAIL billing snapshot blanks for ${r.fullName}`);
    }
  }
  results.push({
    name: 'Monthly billing snapshot has cycle, period, next due',
    pass: snapshotBlankFails === 0,
    detail:
      snapshotBlankFails === 0
        ? 'Active monthly bookings sampled'
        : `${snapshotBlankFails} bookings with blank billing snapshot fields`,
  });

  // 2. Last invoice appears when rent invoices exist
  const withInvoices = await db
    .selectDistinct({
      customerId: rentInvoices.customerId,
      bookingId: rentInvoices.bookingId,
    })
    .from(rentInvoices)
    .where(
      and(eq(rentInvoices.isAdhoc, false), sql`${rentInvoices.status} != 'cancelled'`),
    )
    .limit(30);

  let lastInvoiceFails = 0;
  for (const row of withInvoices) {
    const defaults = await getResidentBillingFormDefaults(row.customerId, row.bookingId);
    if (!defaults?.lastInvoice) {
      lastInvoiceFails += 1;
    }
  }
  results.push({
    name: 'Last invoice appears',
    pass: lastInvoiceFails === 0,
    detail:
      lastInvoiceFails === 0
        ? `${withInvoices.length} bookings with invoices checked`
        : `${lastInvoiceFails} bookings missing lastInvoice snapshot`,
  });

  // 3. Paid invoices never show Missing Rent Invoice on profile
  const paidBookings = await db
    .selectDistinct({
      customerId: rentInvoices.customerId,
      bookingId: rentInvoices.bookingId,
    })
    .from(rentInvoices)
    .where(and(eq(rentInvoices.status, 'paid'), eq(rentInvoices.isAdhoc, false)))
    .limit(30);

  let auditProfileFails = 0;
  for (const row of paidBookings) {
    const open = await getOpenActionsForResident(row.customerId);
    const primary = pickPrimaryUnresolvedAction(open.map(mapUnresolvedActionRow));
    if (primary?.label.toLowerCase().includes('missing rent invoice')) {
      auditProfileFails += 1;
    }
  }

  const staleAuditItems = await db
    .select({ id: actionItems.id })
    .from(actionItems)
    .where(
      and(
        inArray(actionItems.status, ['open', 'in_progress']),
        sql`${actionItems.sourceKey} LIKE 'financial_audit:MISSING_RENT_INVOICE:%'`,
        sql`EXISTS (
          SELECT 1 FROM rent_invoices ri
          WHERE ri.booking_id::text = split_part(${actionItems.sourceKey}, ':', 3)
            AND ri.is_adhoc = false
            AND ri.status = 'paid'
        )`,
      ),
    );

  results.push({
    name: 'Paid invoices never show Missing Rent Invoice',
    pass: auditProfileFails === 0 && staleAuditItems.length === 0,
    detail:
      auditProfileFails === 0 && staleAuditItems.length === 0
        ? `${paidBookings.length} paid bookings checked, 0 stale audit items`
        : `profile fails ${auditProfileFails}, stale audit items ${staleAuditItems.length}`,
  });

  // 4. Operations badge equals Operations queue
  const badges = await loadAdminNavBadges(CRON);
  const opsPage = await loadResidentOperationsResidentsPage(CRON, null);
  const badgeCount = badges.operations ?? 0;
  const queueCount = opsPage.allQueueCount;
  const openInvoiceReview = await db
    .select({ id: unresolvedActions.id })
    .from(unresolvedActions)
    .where(
      and(eq(unresolvedActions.status, 'OPEN'), eq(unresolvedActions.actionType, 'invoice_review')),
    );

  results.push({
    name: 'Operations badge equals Operations queue',
    pass: badgeCount === queueCount && openInvoiceReview.length === 0,
    detail: `badge ${badgeCount}, queue ${queueCount}, open invoice_review ${openInvoiceReview.length}`,
  });

  console.log('\nAdmin billing UI verification\n');
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.name}: ${r.detail}`);
  }

  const allPass = results.every((r) => r.pass);
  console.log(`\n${allPass ? 'PASS' : 'FAIL'}\n`);
  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
