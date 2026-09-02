/**
 * SELECT-only certification for room-level electricity coverage invariants.
 *
 * Compatible with production schemas that have not yet applied room-change
 * workflow_state columns (uses status enum when workflow_state is absent).
 *
 * Exit codes:
 *   0 = engine invariants PASS (pre-cutover data warnings allowed)
 *   1 = engine invariant FAIL
 *
 * Usage: npm run cert:electricity-room-coverage-readonly
 */
import { config } from 'dotenv';
import { readFileSync } from 'node:fs';

config({ path: '.env' });
config({ path: '.env.local' });
config({ path: '.env.production.local' });

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  for (const path of ['.env.prod.live', '.env.production.local', '.env.local', '.env.off']) {
    try {
      const raw = readFileSync(path, 'utf8');
      const match = raw.match(/^DATABASE_URL=(.+)$/m);
      if (match?.[1]?.trim() && !match[1].includes('placeholder')) {
        process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '');
        return;
      }
    } catch {
      // Try the next local environment file.
    }
  }
}

ensureDatabaseUrl();

import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';

type AuditRow = { issue: string; affected_count: number; severity: string };

/** Issues that block electricity engine cutover. */
const ENGINE_FAIL_ISSUES = new Set([
  'duplicate_active_invoice_room_customer_month',
  'v2_breakdown_conservation_drift',
  'same_room_transfer_boundary_mismatch',
  'cross_room_transfer_boundary_mismatch',
  'cancelled_or_expired_request_changed_reservations',
]);

/**
 * Historical / pre-hardening data findings. Documented WARNs until a generic
 * reconciliation pass (no resident-specific repair in this release).
 */
const PRE_CUTOVER_WARN_ISSUES = new Set([
  'bill_missing_calculation_breakdown',
  'bill_invoice_amount_mismatch_historical',
  'nonzero_electricity_late_fee',
]);

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

async function main(): Promise<void> {
  const hasWorkflowState = await hasColumn('room_change_requests', 'workflow_state');
  const completedPredicate = hasWorkflowState
    ? sql`rcr.workflow_state = 'COMPLETED'`
    : sql`rcr.status = 'completed'`;
  const cancelledPredicate = hasWorkflowState
    ? sql`rcr.workflow_state IN ('CANCELLED', 'EXPIRED')`
    : sql`rcr.status = 'cancelled'`;

  const rows = await db.execute<AuditRow>(sql`
    WITH audit AS (
      SELECT
        'duplicate_active_invoice_room_customer_month' AS issue,
        count(*)::int AS affected_count,
        'fail' AS severity
      FROM (
        SELECT eb.room_id, ei.billing_month, ei.customer_id
        FROM electricity_invoices ei
        JOIN electricity_bills eb ON eb.id = ei.electricity_bill_id
        WHERE ei.status <> 'cancelled'
        GROUP BY eb.room_id, ei.billing_month, ei.customer_id
        HAVING count(*) > 1
      ) duplicate_invoices

      UNION ALL
      SELECT 'nonzero_electricity_late_fee', count(*)::int, 'warn'
      FROM electricity_invoices
      WHERE coalesce(late_fee_locked_paise, 0) <> 0

      UNION ALL
      SELECT 'v2_breakdown_conservation_drift', count(*)::int, 'fail'
      FROM electricity_bills
      WHERE (calculation_breakdown->>'version')::int = 2
        AND (calculation_breakdown->'conservation'->>'accountedTotalPaise')::bigint <> total_paise

      UNION ALL
      SELECT 'bill_missing_calculation_breakdown', count(*)::int, 'warn'
      FROM electricity_bills
      WHERE calculation_breakdown IS NULL
        AND billing_month >= '2026-06-01'

      UNION ALL
      SELECT 'bill_invoice_amount_mismatch_historical', count(*)::int, 'warn'
      FROM electricity_bills eb
      WHERE eb.billing_month >= '2026-06-01'
        AND eb.calculation_breakdown IS NOT NULL
        AND eb.calculation_breakdown->'conservation'->>'invoiceTotalPaise' IS NOT NULL
        AND (eb.calculation_breakdown->'conservation'->>'invoiceTotalPaise')::bigint
          <> (
            SELECT coalesce(sum(ei.amount_paise), 0)::bigint
            FROM electricity_invoices ei
            WHERE ei.electricity_bill_id = eb.id
              AND ei.status <> 'cancelled'
          )

      UNION ALL
      SELECT 'same_room_transfer_boundary_mismatch', count(*)::int, 'fail'
      FROM room_change_requests rcr
      JOIN beds source_bed ON source_bed.id = rcr.from_bed_id
      JOIN beds target_bed ON target_bed.id = rcr.to_bed_id
      WHERE ${completedPredicate}
        AND source_bed.room_id = target_bed.room_id
        AND rcr.expected_transfer_date IS NOT NULL
        AND (
          NOT EXISTS (
            SELECT 1 FROM bed_reservations old_br
            WHERE old_br.booking_id = rcr.booking_id
              AND old_br.bed_id = rcr.from_bed_id
              AND upper(old_br.stay_range) = rcr.expected_transfer_date::date
          )
          OR NOT EXISTS (
            SELECT 1 FROM bed_reservations new_br
            WHERE new_br.booking_id = rcr.booking_id
              AND new_br.bed_id = rcr.to_bed_id
              AND lower(new_br.stay_range) = rcr.expected_transfer_date::date
          )
        )

      UNION ALL
      SELECT 'cross_room_transfer_boundary_mismatch', count(*)::int, 'fail'
      FROM room_change_requests rcr
      JOIN beds source_bed ON source_bed.id = rcr.from_bed_id
      JOIN beds target_bed ON target_bed.id = rcr.to_bed_id
      WHERE ${completedPredicate}
        AND source_bed.room_id <> target_bed.room_id
        AND rcr.expected_transfer_date IS NOT NULL
        AND (
          NOT EXISTS (
            SELECT 1 FROM bed_reservations old_br
            WHERE old_br.booking_id = rcr.booking_id
              AND old_br.bed_id = rcr.from_bed_id
              AND upper(old_br.stay_range) = rcr.expected_transfer_date::date
          )
          OR NOT EXISTS (
            SELECT 1 FROM bed_reservations new_br
            WHERE new_br.booking_id = rcr.booking_id
              AND new_br.bed_id = rcr.to_bed_id
              AND lower(new_br.stay_range) = rcr.expected_transfer_date::date
          )
        )

      UNION ALL
      SELECT 'cancelled_or_expired_request_changed_reservations', count(*)::int, 'fail'
      FROM room_change_requests rcr
      WHERE ${cancelledPredicate}
        AND rcr.expected_transfer_date IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM bed_reservations br
          WHERE br.booking_id = rcr.booking_id
            AND br.bed_id = rcr.to_bed_id
            AND lower(br.stay_range) = rcr.expected_transfer_date::date
            AND br.created_at >= rcr.created_at
        )
    )
    SELECT issue, affected_count, severity FROM audit ORDER BY issue
  `);

  const failures = rows.filter(
    (row) => ENGINE_FAIL_ISSUES.has(row.issue) && Number(row.affected_count) > 0,
  );
  const warnings = rows.filter(
    (row) => PRE_CUTOVER_WARN_ISSUES.has(row.issue) && Number(row.affected_count) > 0,
  );

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  console.log(
    JSON.stringify(
      {
        certification: 'electricity-room-coverage',
        schema: { room_change_workflow_state: hasWorkflowState },
        status,
        failCount: failures.length,
        warnCount: warnings.length,
        engineFailures: failures,
        preCutoverWarnings: warnings,
        rows,
        notes: [
          'WARN bill_missing_calculation_breakdown: historical bills before breakdown-required generate.',
          'WARN bill_invoice_amount_mismatch_historical: pre-existing conservation/invoice drift; no silent rewrite.',
          'WARN nonzero_electricity_late_fee: locked late-fee residual; electricity late fee is zero going forward.',
          'Engine FAIL set: duplicate invoices, v2 conservation drift, transfer boundary mismatches.',
        ],
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

void main();
