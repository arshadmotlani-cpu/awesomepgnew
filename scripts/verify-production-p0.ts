#!/usr/bin/env npx tsx
/**
 * Production P0 verification bundle — run before Production Stabilization commit.
 *
 * Target: Production Neon (not Preview / Development).
 * Neon integration DATABASE_URL is deploy-time only — not exportable via Vercel CLI.
 *
 * Usage (with `.env.prod.live` in repo root — gitignored):
 *   npx tsx scripts/verify-production-p0.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '@/src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('verify-production-p0.ts');

import { getDatabaseUrl } from '@/src/lib/db/env';
import { closeDb } from '@/src/db/client';

type StepResult = { id: string; name: string; pass: boolean; detail: string };

const steps: StepResult[] = [];

function record(id: string, name: string, pass: boolean, detail: string) {
  steps.push({ id, name, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
}

async function main() {
  const dbUrl = getDatabaseUrl();
  const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
  if (isLocalhost) {
    console.warn(
      'WARNING: DATABASE_URL points to localhost — production P0 verification requires Neon production URL.\n',
    );
  }

  console.log('=== P0.1 Auth / session policy (code) ===');
  const { env } = await import('@/src/lib/env');
  record(
    'auth-session-days',
    'Standard session TTL',
    env.AUTH_CUSTOMER_SESSION_DAYS >= 30,
    `${env.AUTH_CUSTOMER_SESSION_DAYS} days (target ≥30)`,
  );
  record(
    'auth-remember-days',
    'Remember-device TTL',
    env.AUTH_CUSTOMER_REMEMBER_DAYS >= 60,
    `${env.AUTH_CUSTOMER_REMEMBER_DAYS} days`,
  );

  if (!isLocalhost) {
    console.log('\n=== P0.2–P0.4 Production DB audits ===');
    const { execSync } = await import('node:child_process');
    try {
      execSync('npx tsx scripts/production-stabilization-audit.ts', {
        stdio: 'inherit',
        env: process.env,
      });
      record('production-audit', 'Stabilization audit script', true, 'completed');
    } catch {
      record('production-audit', 'Stabilization audit script', false, 'see output above');
    }

    console.log('\n=== P0.2 Room 203 electricity repair (dry-run cert) ===');
    const { pgs } = await import('@/src/db/schema');
    const { ilike, isNull } = await import('drizzle-orm');
    const { db } = await import('@/src/db/client');
    const [pg] = await db
      .select({ id: pgs.id })
      .from(pgs)
      .where(ilike(pgs.name, '%shanti%'))
      .limit(1);
    if (pg) {
      const mockSession = {
        kind: 'admin' as const,
        sessionId: 'p0-verify',
        adminId: 'p0-verify',
        email: 'p0@verify',
        fullName: 'P0 Verify',
        role: 'super_admin' as const,
        pgScope: [],
        mustChangePassword: false,
        rememberMe: false,
        expiresAt: new Date(Date.now() + 3600_000),
      };
      const { getShantinagarOccupancyCertification } = await import(
        '@/src/services/shantinagarOccupancySsotRepair'
      );
      const cert = await getShantinagarOccupancyCertification(pg.id, mockSession);
      const room203 = cert.room203;
      const krishna = room203.residents.find((r) => r.name.toLowerCase().includes('krishna'));
      const harishRow = room203.residents.find((r) => r.name.toLowerCase().includes('harish'));
      record(
        'elec-room203-krishna',
        'Krishna June electricity ~₹1,200',
        Boolean(krishna && krishna.amountPaise >= 118_000 && krishna.amountPaise <= 122_000),
        krishna ? `₹${(krishna.amountPaise / 100).toFixed(2)}` : 'not found',
      );
      record(
        'elec-room203-harish',
        'Harish excluded from June split',
        !harishRow || harishRow.amountPaise === 0,
        !harishRow ? 'not in invoice list' : `₹${(harishRow.amountPaise / 100).toFixed(2)}`,
      );
      record(
        'occupancy-cert',
        'Shantinagar occupancy certification',
        cert.roomOccupancy.every((r) => r.vacant || r.occupants.length > 0),
        `${cert.activeResidents.length} active residents`,
      );
    }
  } else {
    record(
      'production-db',
      'Production DATABASE_URL',
      false,
      'Set Neon production URL from dashboard (not via vercel env pull/run)',
    );
  }

  const failed = steps.filter((s) => !s.pass);
  console.log(`\n=== Summary: ${steps.length - failed.length}/${steps.length} passed ===`);
  if (failed.length > 0) {
    console.error('\nBlocked steps:');
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }

  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
