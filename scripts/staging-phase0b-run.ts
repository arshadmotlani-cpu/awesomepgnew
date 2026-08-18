/* eslint-disable no-console */
/**
 * Phase 0B staging orchestrator — single process so staging env persists across steps.
 * Aborts if Hair URL resolves to production.
 */
import { execSync } from 'node:child_process';
import { requireStagingEnv, getResolvedHairHost } from '@/src/lib/db/loadStagingEnv';
import { getPlatformDatabaseHost } from '@/src/platform/lib/db/env';

requireStagingEnv();

const hairHost = getResolvedHairHost();
const platformHost = getPlatformDatabaseHost();
console.log('Phase 0B staging run');
console.log(`  Hair: ${hairHost}`);
console.log(`  Platform: ${platformHost}`);
console.log('');

const steps = [
  ['platform:db:migrate', 'npm run platform:db:migrate'],
  ['hair:db:migrate', 'npm run hair:db:migrate'],
  ['hair:saas:bootstrap-platform', 'npm run hair:saas:bootstrap-platform'],
  ['hair:saas:backfill-tenant', 'npm run hair:saas:backfill-tenant'],
  ['hair:saas:bootstrap-verify', 'npm run hair:saas:bootstrap-verify'],
  ['hair:saas:tenant-reconcile', 'npm run hair:saas:tenant-reconcile'],
  ['hair:saas:staging-preflight', 'npm run hair:saas:staging-preflight'],
];

for (const [label, cmd] of steps) {
  console.log(`\n=== ${label} ===\n`);
  execSync(cmd, {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
}

console.log('\n✓ Phase 0B staging pipeline complete');
