/* eslint-disable no-console */
/**
 * Generic admin booking bed transfer (production-capable).
 *
 * Dry run:
 *   USE_PRODUCTION_DB=1 npx tsx scripts/execute-admin-booking-bed-transfer.ts \
 *     --booking-code APG-2026-0115 --pg shantinagar-awesome-pg --to-room 102 --to-bed B3 \
 *     --transfer-date 2026-09-26
 *
 * Apply:
 *   ... --apply
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('execute-admin-booking-bed-transfer');

import { closeDb } from '@/src/db/client';
import {
  executeAdminBookingBedTransfer,
  planAdminBookingBedTransfer,
} from '@/src/services/adminBookingBedTransfer';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

async function main() {
  const bookingCode = arg('--booking-code');
  const toRoom = arg('--to-room');
  const toBed = arg('--to-bed');
  const pgSlug = arg('--pg');
  const transferDate = arg('--transfer-date');
  const apply = process.argv.includes('--apply');
  const preservePricing = !process.argv.includes('--reprice-to-destination');

  if (!bookingCode || !toRoom || !toBed) {
    console.error(
      'Usage: --booking-code CODE --to-room NNN --to-bed Bn [--pg slug] [--transfer-date YYYY-MM-DD] [--apply] [--reprice-to-destination]',
    );
    process.exit(1);
  }

  const actorIdFromEnv = process.env.ADMIN_OPS_ACTOR_ID?.trim();
  let actorId = actorIdFromEnv;
  if (!actorId) {
    const { db } = await import('@/src/db/client');
    const { sql } = await import('drizzle-orm');
    const rows = await db.execute(sql`
      SELECT id::text FROM admin_users WHERE role = 'super_admin' AND is_active = true ORDER BY created_at LIMIT 1
    `);
    actorId = (rows[0] as { id?: string })?.id;
  }
  if (!actorId) {
    console.error('Set ADMIN_OPS_ACTOR_ID to a valid admin UUID.');
    process.exit(1);
  }

  const plan = await planAdminBookingBedTransfer({
    bookingCode,
    toRoomNumber: toRoom,
    toBedCode: toBed,
    pgSlug,
    transferDate,
    preservePricingSnapshot: preservePricing,
  });

  if ('ok' in plan && plan.ok === false) {
    console.error(plan.message);
    process.exit(1);
  }

  console.log(JSON.stringify(plan, null, 2));

  if (!apply) {
    console.log('\nDry run only — pass --apply to execute.');
    await closeDb();
    return;
  }

  const result = await executeAdminBookingBedTransfer({
    actorId,
    bookingCode,
    toRoomNumber: toRoom,
    toBedCode: toBed,
    pgSlug,
    transferDate,
    preservePricingSnapshot: preservePricing,
    dryRun: false,
  });

  if (!result.ok) {
    console.error('FAILED:', result.message);
    process.exit(1);
  }

  console.log('\nSUCCESS', {
    bookingCode: result.plan.bookingCode,
    fromBedId: result.fromBedId,
    toBedId: result.plan.toBedId,
    transferDate: result.plan.transferDate,
    stayRangeAfter: result.plan.stayRangeAfter,
  });

  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
