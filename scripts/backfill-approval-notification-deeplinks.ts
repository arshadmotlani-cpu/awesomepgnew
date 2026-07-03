/**
 * Backfill stale approval notification deep links → Operations WFA.
 *
 * Usage: npx tsx scripts/backfill-approval-notification-deeplinks.ts [--dry-run]
 */

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

const STALE_PATTERNS = [
  '/admin/billing',
  '/admin/collections',
  '/admin/overview',
  'tab=approvals',
];

const TARGET_PREFIX = '/admin/operations?filter=waiting_for_approval';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const rows = await db.execute<{ id: string; deep_link: string; dedupe_key: string }>(sql`
    SELECT id, deep_link, dedupe_key
    FROM notifications
    WHERE audience = 'admin'
      AND type IN ('payment_proof_uploaded', 'payment_received')
      AND NOT is_archived
      AND (
        deep_link LIKE '%/admin/billing%'
        OR deep_link LIKE '%/admin/collections%'
        OR deep_link LIKE '%/admin/overview%'
        OR deep_link LIKE '%tab=approvals%'
      )
  `);

  console.log(`Found ${rows.length} stale payment-proof notification(s).`);
  for (const row of rows) {
    const needsFix = STALE_PATTERNS.some((p) => row.deep_link.includes(p));
    if (!needsFix) continue;

    let focus: string | null = null;
    const reviewMatch = row.dedupe_key.match(/^payment_review:(.+)$/);
    if (reviewMatch) focus = reviewMatch[1] ?? null;

    const newLink = focus
      ? `${TARGET_PREFIX}&focus=${encodeURIComponent(focus)}`
      : TARGET_PREFIX;

    console.log(`${dryRun ? '[dry-run] ' : ''}${row.id}: ${row.deep_link} → ${newLink}`);

    if (!dryRun) {
      await db.execute(sql`
        UPDATE notifications
        SET deep_link = ${newLink}
        WHERE id = ${row.id}::uuid
      `);
    }
  }

  console.log(dryRun ? 'Dry run complete.' : 'Backfill complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
