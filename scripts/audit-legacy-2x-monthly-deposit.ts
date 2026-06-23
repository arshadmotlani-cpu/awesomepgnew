#!/usr/bin/env npx tsx
/**
 * Read-only audit: monthly/open-ended bookings whose stored deposit matches
 * the legacy 2× monthly rent rule instead of the current 2-week (½ month) rule.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' npx tsx scripts/audit-legacy-2x-monthly-deposit.ts
 *   DOTENV_CONFIG_PATH=/tmp/awesomepg-prod.env npx tsx -r dotenv/config scripts/audit-legacy-2x-monthly-deposit.ts
 *   npx tsx scripts/audit-legacy-2x-monthly-deposit.ts --json > legacy-deposit-audit.json
 *
 * Does NOT modify production data.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, closeDb } from '@/src/db/client';
import { paiseToInr } from '@/src/lib/format';
import { computeMonthlyDepositPaise } from '@/src/lib/pricing/depositRules';

type AuditRow = {
  booking_id: string;
  booking_code: string;
  status: string;
  duration_mode: string;
  stay_type: string | null;
  customer_name: string;
  customer_phone: string;
  monthly_rent_paise: number;
  stored_deposit_paise: number;
  legacy_2x_deposit_paise: number;
  expected_2week_deposit_paise: number;
  difference_paise: number;
  deposit_collected_paise: number;
  created_at: string;
};

function monthlyRentFromSnapshot(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const perBed = (snapshot as { perBed?: Array<{ monthlyRatePaise?: number }> }).perBed;
  if (!Array.isArray(perBed) || perBed.length === 0) return 0;
  return perBed.reduce((sum, bed) => sum + Number(bed.monthlyRatePaise ?? 0), 0);
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.error('DATABASE_URL not set — paste Neon production URL or use DOTENV_CONFIG_PATH.');
    process.exit(1);
  }

  const host = (() => {
    try {
      return new URL(url.replace(/^postgres:/, 'postgresql:')).hostname;
    } catch {
      return '(unknown)';
    }
  })();
  console.error(`Auditing legacy 2× monthly deposit bookings (read-only) — DB host: ${host}\n`);

  const rows = await db.execute<AuditRow>(sql`
    SELECT
      b.id::text AS booking_id,
      b.booking_code,
      b.status::text AS status,
      b.duration_mode::text AS duration_mode,
      CASE
        WHEN b.duration_mode IN ('daily', 'weekly', 'fixed_stay') THEN 'fixed_date_stay'
        ELSE 'monthly_stay'
      END AS stay_type,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.deposit_paise AS stored_deposit_paise,
      b.created_at::text AS created_at,
      COALESCE(
        (
          SELECT SUM((elem->>'monthlyRatePaise')::bigint)
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(b.pricing_snapshot->'perBed') = 'array'
              THEN b.pricing_snapshot->'perBed'
              ELSE '[]'::jsonb
            END
          ) elem
        ),
        0
      )::bigint AS monthly_rent_paise,
      COALESCE(
        (
          SELECT SUM(dl.amount_paise)
          FROM deposit_ledger dl
          WHERE dl.booking_id = b.id AND dl.entry_kind = 'collected'
        ),
        0
      )::bigint AS deposit_collected_paise
    FROM bookings b
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE b.duration_mode IN ('monthly', 'open_ended')
      AND b.status NOT IN ('cancelled', 'refunded', 'draft')
      AND c.is_test = false
      AND COALESCE(
        (
          SELECT SUM((elem->>'monthlyRatePaise')::bigint)
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(b.pricing_snapshot->'perBed') = 'array'
              THEN b.pricing_snapshot->'perBed'
              ELSE '[]'::jsonb
            END
          ) elem
        ),
        0
      ) > 0
    ORDER BY b.created_at DESC
  `);

  const flagged: Array<AuditRow & { legacy_2x_deposit_paise: number; expected_2week_deposit_paise: number; difference_paise: number }> = [];
  const matched2week: AuditRow[] = [];
  const otherMismatch: AuditRow[] = [];

  for (const row of rows) {
    const monthlyRent = Number(row.monthly_rent_paise);
    const stored = Number(row.stored_deposit_paise);
    const legacy2x = monthlyRent * 2;
    const expected2week = computeMonthlyDepositPaise({ monthlyRatePaise: monthlyRent });
    const diff = stored - expected2week;

    const enriched = {
      ...row,
      monthly_rent_paise: monthlyRent,
      stored_deposit_paise: stored,
      legacy_2x_deposit_paise: legacy2x,
      expected_2week_deposit_paise: expected2week,
      difference_paise: diff,
      deposit_collected_paise: Number(row.deposit_collected_paise),
    };

    if (stored === legacy2x && stored !== expected2week) {
      flagged.push(enriched);
    } else if (stored === expected2week) {
      matched2week.push(enriched);
    } else if (Math.abs(diff) > 0) {
      otherMismatch.push(enriched);
    }
  }

  const asJson = process.argv.includes('--json');

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          auditedAt: new Date().toISOString(),
          dbHost: host,
          summary: {
            totalMonthlyOpenEnded: rows.length,
            legacy2xMatches: flagged.length,
            already2weekRule: matched2week.length,
            otherDepositMismatch: otherMismatch.length,
          },
          legacy2xBookings: flagged.map((r) => ({
            bookingCode: r.booking_code,
            bookingId: r.booking_id,
            resident: r.customer_name,
            phone: r.customer_phone,
            status: r.status,
            durationMode: r.duration_mode,
            stayType: r.stay_type,
            monthlyRentPaise: r.monthly_rent_paise,
            monthlyRentInr: paiseToInr(r.monthly_rent_paise),
            storedDepositPaise: r.stored_deposit_paise,
            storedDepositInr: paiseToInr(r.stored_deposit_paise),
            expected2weekDepositPaise: r.expected_2week_deposit_paise,
            expected2weekDepositInr: paiseToInr(r.expected_2week_deposit_paise),
            differencePaise: r.difference_paise,
            differenceInr: paiseToInr(r.difference_paise),
            depositCollectedPaise: r.deposit_collected_paise,
            depositCollectedInr: paiseToInr(r.deposit_collected_paise),
            createdAt: r.created_at,
          })),
          otherMismatchBookings: otherMismatch.map((r) => ({
            bookingCode: r.booking_code,
            resident: r.customer_name,
            storedDepositInr: paiseToInr(r.stored_deposit_paise),
            expected2weekDepositInr: paiseToInr(r.expected_2week_deposit_paise),
            differenceInr: paiseToInr(r.difference_paise),
          })),
        },
        null,
        2,
      ),
    );
    await closeDb();
    return;
  }

  console.log('=== Legacy 2× monthly deposit audit (read-only) ===\n');
  console.log(`Total monthly/open-ended bookings with monthly rate: ${rows.length}`);
  console.log(`Legacy 2× rule (stored = 2× rent, ≠ 2-week expected): ${flagged.length}`);
  console.log(`Already 2-week rule (stored = ½ rent): ${matched2week.length}`);
  console.log(`Other deposit mismatches: ${otherMismatch.length}\n`);

  if (flagged.length === 0) {
    console.log('No bookings flagged as legacy 2× monthly deposit.');
  } else {
    console.log('--- Affected bookings (legacy 2×) ---\n');
    console.table(
      flagged.map((r) => ({
        booking: r.booking_code,
        resident: r.customer_name,
        status: r.status,
        monthly_rent: paiseToInr(r.monthly_rent_paise),
        stored_deposit: paiseToInr(r.stored_deposit_paise),
        expected_2week: paiseToInr(r.expected_2week_deposit_paise),
        difference: paiseToInr(r.difference_paise),
        collected: paiseToInr(r.deposit_collected_paise),
        created: r.created_at.slice(0, 10),
      })),
    );
  }

  if (otherMismatch.length > 0) {
    console.log('\n--- Other deposit mismatches (not legacy 2×) ---\n');
    console.table(
      otherMismatch.slice(0, 20).map((r) => ({
        booking: r.booking_code,
        resident: r.customer_name,
        stored: paiseToInr(r.stored_deposit_paise),
        expected_2week: paiseToInr(r.expected_2week_deposit_paise),
        diff: paiseToInr(r.difference_paise),
      })),
    );
    if (otherMismatch.length > 20) {
      console.log(`… and ${otherMismatch.length - 20} more`);
    }
  }

  console.log('\nNo data was modified.');
  console.log('Re-run with --json for machine-readable output.');
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
