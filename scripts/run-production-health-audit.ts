/**
 * Phase 3.2 — run bed, financial, and system health audits against **production** DB.
 *
 * Target: Production Neon (not Preview / Development).
 * Neon integration secrets are not exportable via `vercel env pull` or `vercel env run`.
 *
 * Usage (with `.env.prod.live` in repo root — gitignored):
 *   npx tsx scripts/run-production-health-audit.ts
 */
import { loadProductionAuditEnv, requireDatabaseUrl } from '../src/lib/db/loadEnv';

loadProductionAuditEnv();
requireDatabaseUrl('run-production-health-audit.ts');

import { closeDb } from '../src/db/client';
import type { AdminSession } from '../src/lib/auth/session';
import { runBedAudit, repairBedAuditIssue } from '../src/services/bedAudit';
import { runFinancialHealthAudit } from '../src/services/financialAudit';
import { runSystemHealthAudit } from '../src/services/systemHealthAudit';
import { runProductionAudit } from '../src/services/productionAudit';
import { repairVacatingAuditIssues, runVacatingAudit } from '../src/services/vacatingAudit';

function mockSuperAdminSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: '00000000-0000-4000-8000-000000000099',
    adminId: '00000000-0000-4000-8000-000000000001',
    email: 'audit@local',
    fullName: 'Health Audit',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };
}

async function main() {
  const session = mockSuperAdminSession();

  console.log('\n=== BED AUDIT (before repair) ===\n');
  const bedBefore = await runBedAudit();
  console.log(`Beds checked: ${bedBefore.bedsChecked}`);
  console.log(`Issues: ${bedBefore.issues.length}`);
  for (const issue of bedBefore.issues) {
    console.log(`  [${issue.kind}] ${issue.detail} (${issue.bedCode || issue.bookingId})`);
  }

  const repairable = bedBefore.issues.filter((i) =>
    ['ghost_occupied', 'double_assignment'].includes(i.kind),
  );
  if (repairable.length > 0) {
    console.log('\n=== BED REPAIR (emergency) ===\n');
    for (const issue of repairable) {
      const result = await repairBedAuditIssue(issue);
      console.log(`  ${issue.kind}: ${result.message}`);
    }
  }

  console.log('\n=== BED AUDIT (after repair) ===\n');
  const bedAfter = await runBedAudit();
  console.log(`Issues: ${bedAfter.issues.length}`);
  for (const issue of bedAfter.issues) {
    console.log(`  [${issue.kind}] ${issue.detail}`);
  }

  console.log('\n=== FINANCIAL AUDIT ===\n');
  const financial = await runFinancialHealthAudit(session);
  for (const c of financial.checks) {
    const mark = c.differencePaise === 0 ? 'PASS' : 'FAIL';
    console.log(
      `  [${mark}] ${c.name}: surface ${c.surfaceValuePaise} vs engine ${c.engineValuePaise} (Δ ${c.differencePaise})`,
    );
  }

  const vacatingBefore = await runVacatingAudit();
  if (vacatingBefore.issues.length > 0) {
    console.log('\n=== VACATING REPAIR ===\n');
    const repair = await repairVacatingAuditIssues(vacatingBefore.issues);
    for (const msg of repair.messages) {
      console.log(`  ${msg}`);
    }
    console.log(`Repaired: ${repair.repaired}`);
  }

  console.log('\n=== PRODUCTION AUDIT (unified) ===\n');
  const prod = await runProductionAudit(session);
  for (const gate of prod.gates) {
    console.log(`  [${gate.pass ? 'PASS' : 'FAIL'}] ${gate.name}: ${gate.summary}`);
    for (const m of gate.mismatches.slice(0, 5)) {
      console.log(`      - ${m}`);
    }
  }

  console.log(`\n=== OVERALL: ${prod.allPass ? 'PRODUCTION READY' : 'NOT READY'} ===\n`);
  process.exit(prod.allPass ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closeDb());
