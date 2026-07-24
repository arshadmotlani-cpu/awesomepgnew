#!/usr/bin/env npx tsx
/**
 * Post-deploy P0 smoke: migrations 0124/0125 + resident/admin loader paths.
 *
 * Usage:
 *   npx tsx scripts/p0-production-smoke.ts
 *   npx tsx scripts/p0-production-smoke.ts --migrations-only
 *
 * Smoke 5 (approve move-out) runs only when a safe pending vacating row exists:
 *   - booking_code matches P0_SMOKE_APPROVE_BOOKING_CODE, or
 *   - PG name matches /demo|sandbox|test/i, or
 *   - P0_SMOKE_VACATING_REQUEST_ID is set (explicit operator override).
 *
 * Set P0_SMOKE_EXECUTE_APPROVE=1 to allow mutation on smoke 5 (default: dry-run approve path).
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('p0-production-smoke.ts');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { createClient, closeDb } from '@/src/db/client';
import type { AdminSession } from '@/src/lib/auth/session';
import { loadAdminVacatingPageData } from '@/src/lib/vacating/loadAdminVacatingPageData';
import { loadBookingFinancialWorkspace } from '@/src/services/bookingFinancialWorkspace';
import {
  getCheckoutSettlementForCustomer,
  getLatestCheckoutSettlementStatusForCustomer,
  getResidentMoveOutSettlementContext,
} from '@/src/services/checkoutSettlement';
import { loadEstimatedSettlementForVacating } from '@/src/lib/vacating/estimatedSettlementPreview';
import { buildSettlementStatementModel } from '@/src/lib/vacating/settlementStatementModel';
import { buildFallbackPgLetterhead } from '@/src/lib/billing/pgLetterheadFallback';
import { approveVacatingRequest } from '@/src/services/vacating';

const INCIDENT_BOOKING_ID = '28520507-32da-4d80-84d5-b35db3e01963';
const MIGRATIONS_ONLY = process.argv.includes('--migrations-only');

const mockAdmin: AdminSession = {
  adminId: 'p0-smoke',
  email: 'p0-smoke@awesomepg.app',
  fullName: 'P0 Smoke',
  role: 'super_admin',
};

type Result = { id: string; pass: boolean; detail: string };

const results: Result[] = [];

function record(id: string, pass: boolean, detail: string) {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${id}] ${detail}`);
}

function migrationHashesByTag(): Record<string, string> {
  const migrations = readMigrationFiles({ migrationsFolder: 'src/db/migrations' });
  const journal = JSON.parse(
    readFileSync(join(process.cwd(), 'src/db/migrations/meta/_journal.json'), 'utf8'),
  ) as { entries: Array<{ tag: string; when: number }> };
  const byWhen = new Map(migrations.map((m) => [m.folderMillis, m.hash]));
  const out: Record<string, string> = {};
  for (const entry of journal.entries) {
    const hash = byWhen.get(entry.when);
    if (hash) out[entry.tag] = hash;
  }
  return out;
}

async function verifyMigrations(): Promise<boolean> {
  const { db, sql: pg, close } = createClient({ max: 1 });

  const colRows = await db.execute<{ ok: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'checkout_settlements'
        AND column_name = 'approval_baseline_locked'
    ) AS ok
  `);
  const hasColumn = colRows[0]?.ok === true;
  record(
    'migrations.0124_column',
    hasColumn,
    hasColumn
      ? 'checkout_settlements.approval_baseline_locked present'
      : 'column approval_baseline_locked missing',
  );

  const tableRows = await db.execute<{ reg: string | null }>(sql`
    SELECT to_regclass('public.vacating_date_change_requests')::text AS reg
  `);
  const hasTable = Boolean(tableRows[0]?.reg);
  record(
    'migrations.0125_table',
    hasTable,
    hasTable
      ? `vacating_date_change_requests exists (${tableRows[0]?.reg})`
      : 'vacating_date_change_requests missing',
  );

  const hashes = migrationHashesByTag();
  const hash124 = hashes['0124_approval_baseline'];
  const hash125 = hashes['0125_vacating_date_change_requests'];
  const applied = await db.execute<{ hash: string }>(sql`
    SELECT hash FROM drizzle.__drizzle_migrations
  `);
  const appliedSet = new Set(applied.map((r) => r.hash));
  const has124 = hash124 ? appliedSet.has(hash124) : false;
  const has125 = hash125 ? appliedSet.has(hash125) : false;
  record(
    'migrations.0124_journal',
    has124,
    has124 ? '0124 hash in drizzle.__drizzle_migrations' : `0124 hash missing (expected ${hash124})`,
  );
  record(
    'migrations.0125_journal',
    has125,
    has125 ? '0125 hash in drizzle.__drizzle_migrations' : `0125 hash missing (expected ${hash125})`,
  );

  await close();
  return hasColumn && hasTable && has124 && has125;
}

async function pickResidentBooking(): Promise<{
  customerId: string;
  bookingId: string;
  bookingCode: string;
} | null> {
  const { db, close } = createClient({ max: 1 });
  const rows = await db.execute<{
    customer_id: string;
    booking_id: string;
    booking_code: string;
  }>(sql`
    SELECT b.customer_id, b.id AS booking_id, b.booking_code
    FROM bookings b
    WHERE b.status = 'confirmed'
      AND b.customer_id IS NOT NULL
    ORDER BY b.updated_at DESC
    LIMIT 1
  `);
  await close();
  const row = rows[0];
  if (!row) return null;
  return {
    customerId: row.customer_id,
    bookingId: row.booking_id,
    bookingCode: row.booking_code,
  };
}

async function smokeResidentProfile(
  customerId: string,
  bookingId: string,
  bookingCode: string,
): Promise<boolean> {
  try {
    await getLatestCheckoutSettlementStatusForCustomer(customerId, bookingId);
    await getCheckoutSettlementForCustomer(customerId, bookingId);
    await getResidentMoveOutSettlementContext(customerId, bookingId);
    record(
      '1.resident_profile_loaders',
      true,
      `checkout loaders ok customer=${customerId.slice(0, 8)}… booking=${bookingCode}`,
    );
    return true;
  } catch (err) {
    record('1.resident_profile_loaders', false, String(err));
    return false;
  }
}

async function smokeResidentRequests(
  customerId: string,
  bookingId: string,
  bookingCode: string,
): Promise<boolean> {
  try {
    await getResidentMoveOutSettlementContext(customerId, bookingId);
    const vacating = await getVacatingForBooking(bookingId);
    if (
      vacating &&
      ['pending', 'approved'].includes(vacating.status)
    ) {
      const estimated = await loadEstimatedSettlementForVacating({
        bookingId,
        noticeGivenDate: String(vacating.noticeGivenDate),
        vacatingDate: String(vacating.vacatingDate),
        monthlyRentPaiseSnapshot: vacating.monthlyRentPaiseSnapshot,
        noticeRentCoveredDays: vacating.noticeRentCoveredDays,
        noticeChargeableDays: vacating.noticeChargeableDays,
        deductionPaise: vacating.deductionPaise,
        noticeBreakdownJson: vacating.noticeBreakdownJson,
        durationMode: null,
      });
      if (estimated) {
        buildSettlementStatementModel({
          preview: estimated,
          vacatingRequestId: vacating.id,
          bookingId,
          customerName: 'Resident',
          customerPhone: '—',
          bookingCode,
          pgName: 'PG',
          roomNumber: '—',
          bedCode: '—',
          noticeGivenDate: String(vacating.noticeGivenDate),
          vacatingDate: String(vacating.vacatingDate),
          letterhead: buildFallbackPgLetterhead('PG'),
        });
      }
    }
    record(
      '2.resident_requests_tab',
      true,
      `requests/move-out context ok booking=${bookingCode}`,
    );
    return true;
  } catch (err) {
    record('2.resident_requests_tab', false, String(err));
    return false;
  }
}

async function smokeAdminVacating(): Promise<boolean> {
  try {
    const list = await listAdminVacatingRequests({});
    if (!list.ok) {
      record('3.admin_vacating', false, list.error ?? 'list failed');
      return false;
    }
    const page = await loadAdminVacatingPageData(mockAdmin);
    if (!page.data) {
      record('3.admin_vacating', false, 'loadAdminVacatingPageData returned null');
      return false;
    }
    record(
      '3.admin_vacating',
      true,
      `list rows=${list.data.length} page rows=${page.data.vacatingRows.length}`,
    );
    return true;
  } catch (err) {
    record('3.admin_vacating', false, String(err));
    return false;
  }
}

async function smokeFinancialWorkspace(bookingId: string, label: string): Promise<boolean> {
  try {
    const loaded = await loadBookingFinancialWorkspace(mockAdmin, bookingId);
    if (!loaded.ok) {
      record('4.booking_financial_workspace', false, `${label}: ${loaded.error}`);
      return false;
    }
    record(
      '4.booking_financial_workspace',
      true,
      `${label} booking=${loaded.data.bookingCode} vacating=${loaded.data.vacating?.status ?? 'none'}`,
    );
    return true;
  } catch (err) {
    record('4.booking_financial_workspace', false, String(err));
    return false;
  }
}

function isSafePendingRow(row: {
  booking_code: string;
  pg_name: string;
  vacating_request_id: string;
}): boolean {
  const overrideId = process.env.P0_SMOKE_VACATING_REQUEST_ID?.trim();
  if (overrideId && row.vacating_request_id === overrideId) return true;
  const allowCode = process.env.P0_SMOKE_APPROVE_BOOKING_CODE?.trim();
  if (allowCode && row.booking_code === allowCode) return true;
  if (/demo|sandbox|test/i.test(row.pg_name)) return true;
  if (/^TEST-/i.test(row.booking_code)) return true;
  return false;
}

async function smokeApproveMoveOut(): Promise<boolean> {
  const overrideId = process.env.P0_SMOKE_VACATING_REQUEST_ID?.trim();
  if (overrideId && process.env.P0_SMOKE_EXECUTE_APPROVE === '1') {
    const { db, close } = createClient({ max: 1 });
    const current = await db.execute<{
      vacating_request_id: string;
      booking_id: string;
      booking_code: string;
      status: string;
    }>(sql`
      SELECT vr.id AS vacating_request_id, b.id AS booking_id, b.booking_code, vr.status
      FROM vacating_requests vr
      INNER JOIN bookings b ON b.id = vr.booking_id
      WHERE vr.id = ${overrideId}::uuid
      LIMIT 1
    `);
    await close();
    const row = current[0];
    if (row?.status === 'approved') {
      const reload = await loadBookingFinancialWorkspace(mockAdmin, row.booking_id);
      if (!reload.ok) {
        record('5.approve_move_out', false, `post-approve workspace: ${reload.error}`);
        return false;
      }
      record(
        '5.approve_move_out',
        true,
        `incident request already approved; workspace ok booking=${row.booking_code}`,
      );
      return true;
    }
  }

  const { db, close } = createClient({ max: 1 });
  const pending = await db.execute<{
    vacating_request_id: string;
    booking_id: string;
    booking_code: string;
    pg_name: string;
  }>(sql`
    SELECT vr.id AS vacating_request_id, b.id AS booking_id, b.booking_code, p.name AS pg_name
    FROM vacating_requests vr
    INNER JOIN bookings b ON b.id = vr.booking_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bed ON bed.id = br.bed_id
    INNER JOIN rooms r ON r.id = bed.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE vr.status = 'pending'
    ORDER BY vr.created_at ASC
    LIMIT 20
  `);
  await close();

  const safe = pending.find((r) => isSafePendingRow(r));
  if (!safe) {
    if (pending.length === 0) {
      record(
        '5.approve_move_out',
        true,
        'no pending vacating rows — approve path not exercised (vacating list + financial workspace loaders verified)',
      );
      return true;
    }
    record(
      '5.approve_move_out',
      false,
      `${pending.length} pending row(s) but none match safe criteria (set P0_SMOKE_VACATING_REQUEST_ID + P0_SMOKE_EXECUTE_APPROVE=1 to override)`,
    );
    return false;
  }

  if (process.env.P0_SMOKE_EXECUTE_APPROVE !== '1') {
    record(
      '5.approve_move_out',
      true,
      `dry-run: safe pending found booking=${safe.booking_code} (set P0_SMOKE_EXECUTE_APPROVE=1 to mutate)`,
    );
    return true;
  }

  try {
    const result = await approveVacatingRequest({
      requestId: safe.vacating_request_id,
      resolvedByAdminId: null,
    });
    if (!result.ok) {
      record('5.approve_move_out', false, JSON.stringify(result));
      return false;
    }
    const reload = await loadBookingFinancialWorkspace(mockAdmin, safe.booking_id);
    if (!reload.ok) {
      record('5.approve_move_out', false, `post-approve workspace: ${reload.error}`);
      return false;
    }
    record(
      '5.approve_move_out',
      true,
      `approved request=${safe.vacating_request_id.slice(0, 8)}… booking=${safe.booking_code}`,
    );
    return true;
  } catch (err) {
    record('5.approve_move_out', false, String(err));
    return false;
  }
}

async function runFinancialWorkspaceSmoke(): Promise<boolean> {
  const incident = await smokeFinancialWorkspace(INCIDENT_BOOKING_ID, 'incident');
  if (incident) return true;
  const list = await listAdminVacatingRequests({});
  if (list.ok && list.data[0]?.bookingId) {
    return smokeFinancialWorkspace(list.data[0].bookingId, 'fallback');
  }
  return false;
}

async function main() {
  console.log('=== P0 production smoke ===\n');

  const migOk = await verifyMigrations();
  if (MIGRATIONS_ONLY) {
    process.exit(migOk ? 0 : 1);
  }
  if (!migOk) {
    console.error('\nMigrations check failed — aborting loader smokes.');
    process.exit(1);
  }

  const resident = await pickResidentBooking();
  if (!resident) {
    record('1.resident_profile_loaders', false, 'no confirmed booking with customer');
    process.exit(1);
  }

  let allPass = true;
  allPass = (await smokeResidentProfile(
    resident.customerId,
    resident.bookingId,
    resident.bookingCode,
  )) && allPass;
  allPass = (await smokeResidentRequests(
    resident.customerId,
    resident.bookingId,
    resident.bookingCode,
  )) && allPass;
  allPass = (await smokeAdminVacating()) && allPass;
  allPass = (await runFinancialWorkspaceSmoke()) && allPass;
  allPass = (await smokeApproveMoveOut()) && allPass;

  console.log('\n--- Summary ---');
  for (const r of results) {
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.id}: ${r.detail}`);
  }

  await closeDb();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
