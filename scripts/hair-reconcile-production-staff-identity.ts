/* eslint-disable no-console */
/**
 * Idempotent FYHAIR production staff identity reconcile:
 * - Deactivate RC/demo/duplicate staff (preserve historical attributions)
 * - Ensure one active "Arshad Motlani" staff profile
 * - Migrate admin login email admin@foryour.co → arshad@foryour.co (password hash preserved)
 *
 * Dry run (default):
 *   npx tsx scripts/hair-reconcile-production-staff-identity.ts
 *
 * Execute on production Hair:
 *   CONFIRM_PRODUCTION_CUTOVER=1 npx tsx scripts/hair-reconcile-production-staff-identity.ts --execute
 */
import { loadAppEnv } from '@/src/lib/db/loadEnv';
import {
  PRODUCTION_HAIR_HOST_FRAGMENT,
  requireProductionCutoverWriteEnv,
} from '@/src/lib/db/loadProductionCutoverEnv';
import { createHairClient } from '@/src/hair/db/client';
import {
  auditStaffIdentity,
  reconcileStaffIdentity,
} from '@/src/hair/services/staffIdentityReconcile';

loadAppEnv();

const execute = process.argv.includes('--execute');

function resolveHairHost(): string {
  const url = process.env.HAIR_DATABASE_URL ?? '';
  try {
    return new URL(url.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    return url;
  }
}

async function main() {
  const host = resolveHairHost();
  console.log(`Hair database host: ${host || '(unknown)'}`);
  if (host.includes(PRODUCTION_HAIR_HOST_FRAGMENT)) {
    console.log('Production Hair database detected.');
    if (execute) requireProductionCutoverWriteEnv();
  }

  const { db, close } = createHairClient({ max: 1 });
  try {
    const before = await auditStaffIdentity(db);
    console.log('\n=== Before ===');
    console.log(`Active staff: ${before.staff.filter((s) => s.isActive).length}`);
    for (const row of before.staff) {
      console.log(
        `  ${row.isActive ? 'active' : 'inactive'} | ${row.fullName} | attributions=${row.attributionCount} | ${row.id}`,
      );
    }
    if (before.admin) {
      console.log(
        `\nAdmin: ${before.admin.email} (${before.admin.role}) hash=${before.admin.passwordHash.slice(0, 12)}…`,
      );
    }

    const result = await reconcileStaffIdentity(db, { dryRun: !execute });
    console.log('\n=== Plan ===');
    console.log(`Deactivate: ${result.plan.deactivate.length}`);
    for (const row of result.plan.deactivate) {
      console.log(`  ${row.fullName} (${row.id}) — ${row.reason}`);
    }
    if (result.plan.activateCanonicalArshad) {
      console.log(
        `\nCanonical Arshad staff: ${result.plan.activateCanonicalArshad.id} → "${result.plan.activateCanonicalArshad.fullName}"`,
      );
    } else if (result.plan.createCanonicalArshad) {
      console.log('\nCanonical Arshad staff: will create new row');
    }
    if (result.plan.adminEmailMigration) {
      console.log(
        `\nAdmin email: ${result.plan.adminEmailMigration.fromEmail} → ${result.plan.adminEmailMigration.toEmail}`,
      );
      console.log(`Password hash prefix (unchanged): ${result.plan.adminEmailMigration.passwordHashPrefix}…`);
    }
    console.log(`\nSelectable active staff after: ${result.plan.selectableActiveAfter.length}`);
    for (const name of result.plan.selectableActiveAfter) {
      console.log(`  ${name}`);
    }

    if (execute) {
      const after = await auditStaffIdentity(db);
      console.log('\n=== After (applied) ===');
      console.log(`Active staff: ${after.staff.filter((s) => s.isActive).length}`);
      for (const row of after.staff.filter((s) => s.isActive)) {
        console.log(`  ${row.fullName} | ${row.id}`);
      }
      if (after.admin) {
        console.log(
          `\nAdmin: ${after.admin.email} hash=${after.admin.passwordHash.slice(0, 12)}… (was ${result.adminPasswordHashPrefixAfter})`,
        );
      }
    } else {
      console.log('\nDry run only — pass --execute with CONFIRM_PRODUCTION_CUTOVER=1 to apply.');
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
