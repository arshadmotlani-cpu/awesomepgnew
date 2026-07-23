#!/usr/bin/env npx tsx
/**
 * Reproduce payment-review notification archive UPDATE against production DB.
 *
 *   npx tsx scripts/verify-payment-review-notification-archive.ts
 *   npx tsx scripts/verify-payment-review-notification-archive.ts --review-key qr-{uuid}
 *   npx tsx scripts/verify-payment-review-notification-archive.ts --apply-fixed
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';
import { closeDb, db } from '@/src/db/client';
import { actionItems, notifications } from '@/src/db/schema';
import {
  archivePaymentReviewNotificationsForKey,
} from '@/src/services/paymentProofReviewCleanup';
import {
  extractPostgresError,
  formatPostgresError,
} from '@/src/lib/db/postgresError';

loadProductionAuditEnv();
requireDatabaseUrl('verify-payment-review-notification-archive.ts');

function paymentRecordIdFromReviewKey(reviewKey: string): string | null {
  if (!reviewKey.startsWith('qr-')) return null;
  const recordId = reviewKey.slice(3);
  return recordId.length > 0 ? recordId : null;
}

async function printNotificationColumns() {
  const cols = await db.execute<{ column_name: string; data_type: string }>(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications'
    ORDER BY ordinal_position
  `);
  console.log('\nnotifications columns:');
  for (const c of cols) {
    console.log(`  ${c.column_name}: ${c.data_type}`);
  }
}

async function listOpenPaymentReviewKeys(): Promise<string[]> {
  const rows = await db
    .select({ sourceKey: actionItems.sourceKey })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.type, 'payment_received'),
        inArray(actionItems.status, ['open', 'in_progress']),
        sql`${actionItems.sourceKey} LIKE 'payment_review:qr-%'`,
      ),
    );
  return rows.map((r) => r.sourceKey.replace(/^payment_review:/, ''));
}

async function printMatchingNotifications(actionSourceKey: string) {
  const rows = await db
    .select({
      id: notifications.id,
      dedupeKey: notifications.dedupeKey,
      type: notifications.type,
      entityType: notifications.entityType,
      entityId: notifications.entityId,
      isArchived: notifications.isArchived,
      isRead: notifications.isRead,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.audience, 'admin'),
        inArray(notifications.type, ['payment_proof_uploaded', 'payment_received']),
        eq(notifications.isArchived, false),
      ),
    );

  const matched = rows.filter(
    (r) =>
      r.dedupeKey === actionSourceKey ||
      (r.entityType === 'pg_payment_record' &&
        r.entityId != null &&
        actionSourceKey.endsWith(r.entityId)),
  );

  console.log(`\nMatching unarchived notifications for ${actionSourceKey}: ${matched.length}`);
  for (const r of matched) {
    console.log(
      `  id=${r.id} dedupe=${r.dedupeKey} type=${r.type} entity_type=${r.entityType} entity_id=${r.entityId}`,
    );
  }
  return matched;
}

/** Current broken raw SQL from paymentProofReviewCleanup (pre-fix). */
async function runLegacyArchiveUpdate(reviewKey: string): Promise<void> {
  const actionSourceKey = `payment_review:${reviewKey}`;
  const paymentRecordId = paymentRecordIdFromReviewKey(reviewKey);
  const now = new Date();

  await db.execute(sql`
    UPDATE notifications
    SET is_archived = true,
        is_read = true,
        read_at = ${now}
    WHERE audience = 'admin'
      AND type IN ('payment_proof_uploaded', 'payment_received')
      AND NOT is_archived
      AND (
        dedupe_key = ${actionSourceKey}
        OR (
          ${paymentRecordId} IS NOT NULL
          AND entity_type = 'pg_payment_record'
          AND entity_id = ${paymentRecordId}
        )
      )
  `);
}

/** Fixed typed Drizzle update (post-fix). */
async function runFixedArchiveUpdate(reviewKey: string): Promise<number> {
  return archivePaymentReviewNotificationsForKey(reviewKey);
}

async function probeReviewKey(reviewKey: string, applyFixed: boolean) {
  const actionSourceKey = `payment_review:${reviewKey}`;
  console.log('\n' + '─'.repeat(70));
  console.log(`Review key: ${reviewKey}`);
  console.log(`Action source key: ${actionSourceKey}`);

  await printMatchingNotifications(actionSourceKey);

  if (applyFixed) {
    try {
      const archived = await runFixedArchiveUpdate(reviewKey);
      console.log(`\nFixed update: archived ${archived} row(s) — OK`);
    } catch (err) {
      console.error('\nFixed update FAILED:');
      console.error(formatPostgresError(err));
      console.error(JSON.stringify(extractPostgresError(err), null, 2));
    }
    return;
  }

  try {
    await runLegacyArchiveUpdate(reviewKey);
    console.log('\nLegacy update: OK (no error thrown)');
  } catch (err) {
    console.error('\nLegacy update FAILED — full PostgreSQL error:');
    console.error(formatPostgresError(err));
    console.error(JSON.stringify(extractPostgresError(err), null, 2));
  }
}

async function main() {
  const reviewKeyArg = process.argv.find((a) => a.startsWith('--review-key='))?.split('=')[1];
  const applyFixed = process.argv.includes('--apply-fixed');

  console.log('Payment review notification archive diagnostic');
  console.log(`Mode: ${applyFixed ? 'apply-fixed' : 'probe-legacy'}`);

  await printNotificationColumns();

  const reviewKeys = reviewKeyArg ? [reviewKeyArg] : await listOpenPaymentReviewKeys();
  if (reviewKeys.length === 0) {
    console.log('\nNo open payment_review:qr-* action items found.');
    if (!reviewKeyArg) {
      console.log('Pass --review-key=qr-{uuid} to probe a specific key.');
    }
    return;
  }

  console.log(`\nOpen payment review keys: ${reviewKeys.length}`);
  for (const key of reviewKeys) {
    await probeReviewKey(key, applyFixed);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
