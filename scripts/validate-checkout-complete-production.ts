/**
 * Production validation — checkout Pay & complete invariants (read-only).
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/validate-checkout-complete-production.ts
 *   DOTENV_CONFIG_PATH=.env.production.runtime npx tsx scripts/validate-checkout-complete-production.ts --limit=5
 */
import { config } from 'dotenv';
const prodEnvPath = process.env.DOTENV_CONFIG_PATH ?? '.env.production.runtime';
config({ path: prodEnvPath, override: true });
if (!process.env.DOTENV_CONFIG_PATH) {
  config({ path: '.env.local' });
}

import { sql } from 'drizzle-orm';
import { db } from '@/src/db/client';

const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 5);
const sinceHours = Number(process.argv.find((a) => a.startsWith('--since-hours='))?.split('=')[1] ?? 72);

type Row = {
  settlement_id: string;
  booking_id: string;
  booking_code: string;
  customer_name: string;
  status: string;
  final_refund_paise: number | null;
  refund_paid_at: string | null;
  refund_reference: string | null;
  approved_at: string | null;
  vacating_status: string;
  booking_status: string;
  admin_deposit_refund_status: string | null;
  completed_at: string;
};

type Check = { name: string; ok: boolean; detail?: string };

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL required (use DOTENV_CONFIG_PATH=.env.production.runtime)');
    process.exit(1);
  }

  const settlements = (await db.execute(sql`
    SELECT
      cs.id AS settlement_id,
      cs.booking_id,
      b.booking_code,
      c.full_name AS customer_name,
      cs.status,
      cs.final_refund_paise,
      cs.refund_paid_at,
      cs.refund_reference,
      cs.approved_at,
      vr.status AS vacating_status,
      b.status AS booking_status,
      b.admin_deposit_refund_status,
      COALESCE(cs.refund_paid_at, cs.approved_at, cs.updated_at) AS completed_at
    FROM checkout_settlements cs
    INNER JOIN bookings b ON b.id = cs.booking_id
    INNER JOIN customers c ON c.id = cs.customer_id
    INNER JOIN vacating_requests vr ON vr.id = cs.vacating_request_id
    WHERE cs.status IN ('completed', 'refund_paid')
      AND COALESCE(cs.refund_paid_at, cs.approved_at, cs.updated_at) >= NOW() - (${sinceHours}::text || ' hours')::interval
    ORDER BY completed_at DESC
    LIMIT ${limit}
  `)) as Row[];

  console.log(JSON.stringify({ kind: 'checkout_complete_prod_validation', limit, sinceHours, found: settlements.length }, null, 2));

  if (settlements.length === 0) {
    console.log('No terminal checkout settlements in window — run manual UI smoke or widen --since-hours.');
    process.exit(2);
  }

  let passed = 0;
  let failed = 0;
  const reports: Array<{ bookingCode: string; settlementId: string; checks: Check[]; pass: boolean }> = [];

  for (const s of settlements) {
    const checks: Check[] = [];

    checks.push({
      name: 'settlement_status_terminal',
      ok: s.status === 'completed' || s.status === 'refund_paid',
      detail: s.status,
    });

    const refundDue = (s.final_refund_paise ?? 0) > 0;
    checks.push({
      name: 'refund_fields_when_due',
      ok: !refundDue || (s.refund_paid_at != null && Boolean(s.refund_reference?.trim())),
      detail: refundDue
        ? `refund_paid_at=${s.refund_paid_at ?? 'null'} ref=${s.refund_reference ?? 'null'}`
        : 'zero_refund',
    });

    checks.push({
      name: 'vacating_finalized',
      ok: s.vacating_status === 'completed',
      detail: s.vacating_status,
    });

    checks.push({
      name: 'booking_refund_status_when_paid',
      ok: !refundDue || s.admin_deposit_refund_status === 'refunded',
      detail: String(s.admin_deposit_refund_status),
    });

    const depositSettlements = await db.execute(sql`
      SELECT id, idempotency_key, final_refund_paise, refunded_at
      FROM deposit_settlements
      WHERE idempotency_key = ${'checkout:' + s.settlement_id}
    `);
    const dsCount = depositSettlements.length;
    checks.push({
      name: 'single_deposit_settlement_idempotency',
      ok: refundDue ? dsCount === 1 : dsCount <= 1,
      detail: `count=${dsCount}`,
    });

    const ledgerDupes = await db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM deposit_ledger dl
      INNER JOIN deposit_settlements ds ON ds.ledger_entry_id = dl.id
      WHERE ds.idempotency_key = ${'checkout:' + s.settlement_id}
    `);
    checks.push({
      name: 'deposit_ledger_linked_once',
      ok: refundDue ? Number(ledgerDupes[0]?.n ?? 0) === 1 : Number(ledgerDupes[0]?.n ?? 0) <= 1,
      detail: `ledger_rows=${ledgerDupes[0]?.n ?? 0}`,
    });

    const openCheckoutActions = await db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM action_items
      WHERE source_key = ${'checkout_review:' + s.settlement_id}
        AND type = 'refund_request_submitted'
        AND status IN ('open', 'in_progress')
    `);
    checks.push({
      name: 'no_open_checkout_review_notification',
      ok: Number(openCheckoutActions[0]?.n ?? 0) === 0,
      detail: `open=${openCheckoutActions[0]?.n ?? 0}`,
    });

    const auditSpam = await db.execute(sql`
      SELECT action, COUNT(*)::int AS n
      FROM audit_log
      WHERE entity = 'checkout_settlement'
        AND entity_id = ${s.settlement_id}
        AND action IN ('approved', 'refund_paid')
      GROUP BY action
    `);
    const approvedN =
      Number(auditSpam.find((r: { action: string; n: number }) => r.action === 'approved')?.n ?? 0);
    const paidN =
      Number(auditSpam.find((r: { action: string; n: number }) => r.action === 'refund_paid')?.n ?? 0);
    checks.push({
      name: 'audit_not_duplicated',
      ok: approvedN <= 1 && paidN <= 1,
      detail: `approved=${approvedN} refund_paid=${paidN}`,
    });

    const pass = checks.every((c) => c.ok);
    if (pass) passed++;
    else failed++;

    reports.push({
      bookingCode: s.booking_code,
      settlementId: s.settlement_id,
      checks,
      pass,
    });
  }

  console.log(JSON.stringify({ passed, failed, total: settlements.length, reports }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
