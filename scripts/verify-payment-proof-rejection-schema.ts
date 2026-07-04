#!/usr/bin/env npx tsx
/**
 * Post-migrate verification for payment proof rejection schema (0099 + 0100_*).
 *
 *   npx tsx scripts/verify-payment-proof-rejection-schema.ts
 *
 * Production (after deploy migrate):
 *   npx vercel env run --environment production -- npx tsx scripts/verify-payment-proof-rejection-schema.ts
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';

loadAppEnv();

import { sql } from 'drizzle-orm';
import { createClient } from '@/src/db/client';
import { getDatabaseConnectionInfo } from '@/src/lib/db/env';

type Check = { id: string; label: string; pass: boolean; detail: string };

const checks: Check[] = [];

function record(id: string, label: string, pass: boolean, detail: string) {
  checks.push({ id, label, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}`);
  console.log(`       ${detail}`);
}

async function main() {
  const connection = getDatabaseConnectionInfo();
  console.log('═'.repeat(72));
  console.log('PAYMENT PROOF REJECTION SCHEMA VERIFICATION');
  console.log('═'.repeat(72));
  console.log(`Database: ${connection.label} (${connection.host})`);
  console.log('');

  const { db, close } = createClient({ max: 1 });

  try {
    const [tableRow] = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'payment_proof_rejections'
      ) AS exists
    `);
    record(
      'table-payment_proof_rejections',
      'payment_proof_rejections table exists',
      Boolean(tableRow?.exists),
      tableRow?.exists ? 'public.payment_proof_rejections found' : 'table missing — run db:migrate (0099)',
    );

    const [entityEnumRow] = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'payment_proof_entity_type'
      ) AS exists
    `);
    record(
      'enum-payment_proof_entity_type',
      'payment_proof_entity_type enum exists',
      Boolean(entityEnumRow?.exists),
      entityEnumRow?.exists ? 'enum found' : 'enum missing — run db:migrate (0099)',
    );

    const [statusEnumRow] = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'payment_proof_rejection_status'
      ) AS exists
    `);
    record(
      'enum-payment_proof_rejection_status',
      'payment_proof_rejection_status enum exists',
      Boolean(statusEnumRow?.exists),
      statusEnumRow?.exists ? 'enum found' : 'enum missing — run db:migrate (0099)',
    );

    const bookingApprovalRows = await db.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'action_item_type'
        AND e.enumlabel = 'booking_approval'
    `);
    const hasBookingApproval = bookingApprovalRows.length > 0;
    record(
      'enum-booking_approval',
      "action_item_type includes 'booking_approval'",
      hasBookingApproval,
      hasBookingApproval
        ? 'booking_approval enum value present'
        : 'value missing — run db:migrate (0100_booking_approval_action_item)',
    );

    const [nullableRow] = await db.execute<{ is_nullable: string }>(sql`
      SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'pg_payment_records'
        AND column_name = 'payment_screenshot_url'
      LIMIT 1
    `);
    const screenshotNullable = nullableRow?.is_nullable === 'YES';
    record(
      'column-payment_screenshot_url-nullable',
      'pg_payment_records.payment_screenshot_url is nullable',
      screenshotNullable,
      nullableRow
        ? `is_nullable=${nullableRow.is_nullable} (expected YES)`
        : 'column not found',
    );

    const failed = checks.filter((c) => !c.pass);
    console.log('');
    console.log('─'.repeat(72));
    console.log(`Summary: ${checks.length - failed.length}/${checks.length} checks passed`);
    if (failed.length > 0) {
      console.error('\n✗ SCHEMA VERIFICATION FAILED');
      for (const f of failed) {
        console.error(`  - ${f.label}: ${f.detail}`);
      }
      process.exit(1);
    }
    console.log('✓ All payment proof rejection schema checks passed');
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error('✗ Verification script error:', err);
  process.exit(1);
});
