import { sql } from 'drizzle-orm';
import type { createClient } from '@/src/db/client';

type DbClient = ReturnType<typeof createClient>['db'];

export type PaymentProofSchemaCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

export async function runPaymentProofRejectionSchemaChecks(
  db: DbClient,
): Promise<PaymentProofSchemaCheck[]> {
  const checks: PaymentProofSchemaCheck[] = [];

  const [tableRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'payment_proof_rejections'
    ) AS exists
  `);
  checks.push({
    id: 'table-payment_proof_rejections',
    label: 'payment_proof_rejections table exists',
    pass: Boolean(tableRow?.exists),
    detail: tableRow?.exists ? 'found' : 'missing',
  });

  const [entityEnumRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'payment_proof_entity_type'
    ) AS exists
  `);
  checks.push({
    id: 'enum-payment_proof_entity_type',
    label: 'payment_proof_entity_type enum exists',
    pass: Boolean(entityEnumRow?.exists),
    detail: entityEnumRow?.exists ? 'found' : 'missing',
  });

  const [statusEnumRow] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'payment_proof_rejection_status'
    ) AS exists
  `);
  checks.push({
    id: 'enum-payment_proof_rejection_status',
    label: 'payment_proof_rejection_status enum exists',
    pass: Boolean(statusEnumRow?.exists),
    detail: statusEnumRow?.exists ? 'found' : 'missing',
  });

  const bookingApprovalRows = await db.execute<{ enumlabel: string }>(sql`
    SELECT e.enumlabel FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'action_item_type'
      AND e.enumlabel = 'booking_approval'
  `);
  checks.push({
    id: 'enum-booking_approval',
    label: "action_item_type includes 'booking_approval'",
    pass: bookingApprovalRows.length > 0,
    detail: bookingApprovalRows.length > 0 ? 'present' : 'missing',
  });

  const [nullableRow] = await db.execute<{ is_nullable: string }>(sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pg_payment_records'
      AND column_name = 'payment_screenshot_url'
    LIMIT 1
  `);
  checks.push({
    id: 'column-payment_screenshot_url-nullable',
    label: 'pg_payment_records.payment_screenshot_url is nullable',
    pass: nullableRow?.is_nullable === 'YES',
    detail: nullableRow ? `is_nullable=${nullableRow.is_nullable}` : 'column missing',
  });

  return checks;
}

export function summarizePaymentProofSchemaChecks(
  checks: PaymentProofSchemaCheck[],
): { ok: boolean; passed: number; total: number; failed: PaymentProofSchemaCheck[] } {
  const failed = checks.filter((c) => !c.pass);
  return {
    ok: failed.length === 0,
    passed: checks.length - failed.length,
    total: checks.length,
    failed,
  };
}
