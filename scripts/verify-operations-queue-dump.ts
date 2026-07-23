#!/usr/bin/env npx tsx
/**
 * Dump unified Operations queue rows + badge parity + stale payment artifacts.
 *
 *   DATABASE_URL='…' npx tsx scripts/verify-operations-queue-dump.ts
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb, db } from '@/src/db/client';
import { actionItems, notifications, pgPaymentRecords } from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { loadAdminNavBadges } from '@/src/services/adminNavBadges';
import { getUnifiedOperationsQueueForRequest } from '@/src/services/unifiedOperationsQueue';

loadProductionAuditEnv();
requireDatabaseUrl('verify-operations-queue-dump.ts');

const CRON: AdminSession = {
  kind: 'admin',
  sessionId: 'ops-queue-dump',
  adminId: 'ops-queue-dump',
  email: 'audit@system',
  fullName: 'Ops Queue Dump',
  role: 'super_admin',
  pgScope: [],
  mustChangePassword: false,
  rememberMe: false,
  expiresAt: new Date(Date.now() + 86_400_000),
};

async function main() {
  console.log('\n# Operations Queue Dump\n');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  const [queue, badges] = await Promise.all([
    getUnifiedOperationsQueueForRequest(CRON, null),
    loadAdminNavBadges(CRON),
  ]);

  const chipSum = queue.filterCounts.reduce((acc, c) => acc + c.count, 0);

  console.log('## Badge parity\n');
  console.log(`- Sidebar operations badge: ${badges.operations ?? 0}`);
  console.log(`- Sidebar payments badge:   ${badges.payments ?? 0}`);
  console.log(`- Sidebar notifications:    ${badges.notifications ?? 0}`);
  console.log(`- Queue totalCount:         ${queue.totalCount}`);
  console.log(`- Sum of filterCounts:      ${chipSum}`);
  console.log(
    `- Parity: ${(badges.operations ?? 0) === queue.totalCount && chipSum === queue.totalCount ? 'OK' : 'MISMATCH'}`,
  );

  console.log('\n## Filter chips\n');
  console.log('| filter | count |');
  console.log('|--------|-------|');
  for (const chip of queue.filterCounts) {
    console.log(`| ${chip.id} | ${chip.count} |`);
  }

  const allItems = await loadAllQueueItems();

  console.log('\n## Unified queue items\n');
  console.log('| queue | id | resident | booking | reviewKey |');
  console.log('|-------|-----|----------|---------|-----------|');
  for (const item of allItems) {
    console.log(
      `| ${item.queue} | ${item.id.slice(0, 40)} | ${item.residentName.slice(0, 24)} | ${item.bookingCode ?? item.bookingId ?? '—'} | ${item.paymentReviewKey ?? '—'} |`,
    );
  }

  console.log('\n## Payment reviews (table source)\n');
  console.log(`Count: ${queue.paymentReviews.length}`);
  for (const review of queue.paymentReviews) {
    console.log(
      `  - ${review.key} · ${review.residentName} · billingMonth=${review.billingMonth ?? 'null'}`,
    );
  }

  console.log('\n## Stale artifacts\n');

  const pendingProofs = await db
    .select({
      id: pgPaymentRecords.id,
      bookingId: pgPaymentRecords.bookingId,
      status: pgPaymentRecords.status,
      reviewedAt: pgPaymentRecords.reviewedAt,
    })
    .from(pgPaymentRecords)
    .where(
      and(eq(pgPaymentRecords.status, 'pending'), sql`${pgPaymentRecords.bookingId} IS NOT NULL`),
    );

  console.log(`Pending pg_payment_records with booking_id: ${pendingProofs.length}`);
  for (const row of pendingProofs) {
    console.log(`  ${row.id} booking=${row.bookingId}`);
  }

  const openPaymentItems = await db
    .select({ sourceKey: actionItems.sourceKey, status: actionItems.status })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.type, 'payment_received'),
        inArray(actionItems.status, ['open', 'in_progress']),
      ),
    );

  console.log(`Open payment_received action_items: ${openPaymentItems.length}`);
  for (const row of openPaymentItems) {
    console.log(`  ${row.sourceKey} (${row.status})`);
  }

  const staleNotifs = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      entityId: notifications.entityId,
      isRead: notifications.isRead,
      isArchived: notifications.isArchived,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.audience, 'admin'),
        inArray(notifications.type, ['payment_proof_uploaded', 'payment_received']),
        eq(notifications.isArchived, false),
      ),
    );

  console.log(`Unarchived admin payment notifications: ${staleNotifs.length}`);
  for (const row of staleNotifs) {
    console.log(`  ${row.id} ${row.type} read=${row.isRead} entity=${row.entityId ?? '—'}`);
  }

  await closeDb();
}

async function loadAllQueueItems() {
  const allFilters = [
    'waiting_for_approval',
    'rent_due',
    'electricity_due',
    'vacating_requests',
    'refund_due',
    'booking_approval',
    'deposit_due',
    'kyc_review',
  ] as const;
  const seen = new Set<string>();
  const merged: typeof queue.items = [];
  for (const filter of allFilters) {
    const partial = await getUnifiedOperationsQueueForRequest(CRON, filter);
    for (const item of partial.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
