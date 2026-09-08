#!/usr/bin/env npx tsx
/**
 * Read-only production verification for FYHAIR Expenses → Salary.
 * Does NOT create payments or mark salaries paid.
 */
import { sql } from 'drizzle-orm';
import { hairDb } from '../src/hair/db/client';
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

const FYHAIR_ORIGIN = 'https://fyhair.awesomepg.in';
import {
  defaultPayrollMonthKey,
  isPayrollPeriodAvailable,
  payrollPeriodFromMonthKey,
} from '../src/workforce/lib/payrollAvailability';

loadProductionAuditEnv();
requireDatabaseUrl('verify-prod-salary-readonly.ts');

async function checkRoutes() {
  const routes = ['/expenses', '/expenses/salary'];
  for (const path of routes) {
    const url = `${FYHAIR_ORIGIN}${path}`;
    const res = await fetch(url, { redirect: 'manual' });
    console.log(`[route] GET ${path} → HTTP ${res.status} location=${res.headers.get('location') ?? '—'}`);
  }
}

async function checkSchema() {
  const tables = (await hairDb.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('wf_payroll_payments', 'wf_payroll_runs', 'wf_payroll_lines')
    ORDER BY table_name
  `)) as Array<{ table_name: string }>;
  console.log('[schema] payroll tables:', tables.map((r) => r.table_name).join(', ') || 'NONE');

  const indexes = (await hairDb.execute(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (
        'wf_payroll_runs_org_engine_period_uidx',
        'wf_payroll_payments_line_uidx'
      )
    ORDER BY indexname
  `)) as Array<{ indexname: string }>;
  console.log('[schema] idempotency indexes:', indexes.map((r) => r.indexname).join(', ') || 'NONE');

  const migration = (await hairDb.execute(sql`
    SELECT hash FROM drizzle_hair.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 3
  `)) as Array<{ hash: string }>;
  console.log('[schema] latest hair migrations:', migration.map((r) => r.hash).join(', ') || 'NONE');
}

async function checkPayrollLogic() {
  const tz = 'Asia/Kolkata';
  const monthKey = defaultPayrollMonthKey(tz);
  const period = payrollPeriodFromMonthKey(monthKey);
  const available = isPayrollPeriodAvailable(period, tz);
  console.log('[logic] default month:', monthKey);
  console.log('[logic] period:', period.periodStart, '→', period.periodEnd);
  console.log('[logic] available now:', available);

  const runCount = (await hairDb.execute(sql`
    SELECT COUNT(*)::text AS count FROM wf_payroll_runs
  `)) as Array<{ count: string }>;
  const paymentCount = (await hairDb.execute(sql`
    SELECT COUNT(*)::text AS count FROM wf_payroll_payments
  `)) as Array<{ count: string }>;
  console.log('[data] wf_payroll_runs rows:', runCount[0]?.count ?? '0');
  console.log('[data] wf_payroll_payments rows:', paymentCount[0]?.count ?? '0');
}

async function main() {
  console.log('=== FYHAIR Salary read-only verification ===');
  console.log('Target:', FYHAIR_ORIGIN);
  await checkRoutes();
  await checkSchema();
  await checkPayrollLogic();
  console.log('=== Done (no writes performed) ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
