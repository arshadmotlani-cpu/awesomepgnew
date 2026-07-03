#!/usr/bin/env tsx
/**
 * Delete stale Neon preview branches (and optionally old Vercel preview deployments).
 *
 * Required:
 *   NEON_API_KEY, NEON_PROJECT_ID
 *
 * Optional:
 *   NEON_BRANCH_RETENTION_DAYS (default 7)
 *   NEON_BRANCH_HEADROOM (default 2)
 *   NEON_MAX_BRANCHES (default unset — also prune when over limit)
 *   VERCEL_TOKEN + VERCEL_PROJECT_ID — delete stale preview deployments (triggers Neon webhook cleanup)
 *
 * Usage:
 *   npx tsx scripts/cleanup-neon-preview-branches.ts            # dry-run
 *   npx tsx scripts/cleanup-neon-preview-branches.ts --execute  # delete
 */
import {
  parseNeonBranchCleanupConfig,
  runNeonBranchCleanup,
} from '../src/lib/neon/branchCleanup';
import { runVercelPreviewDeploymentCleanup } from '../src/lib/vercel/previewDeploymentCleanup';

function printNeonResult(result: Awaited<ReturnType<typeof runNeonBranchCleanup>>) {
  console.log(`Neon branches listed: ${result.listed} (${result.protected} protected)`);
  if (result.candidates.length === 0) {
    console.log('No Neon preview branches selected for cleanup.');
    return;
  }
  console.log(`${result.dryRun ? 'Would delete' : 'Deleted'} ${result.candidates.length} Neon branch(es):`);
  for (const { branch, reason } of result.candidates) {
    console.log(`  - ${branch.name} (${branch.id}) [${reason}]`);
  }
  if (!result.dryRun && result.deleted.length) {
    console.log(`Deleted: ${result.deleted.join(', ')}`);
  }
  if (result.failed.length) {
    console.error('Failures:');
    for (const f of result.failed) {
      console.error(`  - ${f.branch}: ${f.error}`);
    }
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  const dryRun = !execute;

  if (dryRun) {
    console.log('Dry run — pass --execute to delete branches.\n');
  }

  const neonConfig = parseNeonBranchCleanupConfig();
  if (!neonConfig) {
    console.error(
      'NEON_API_KEY and NEON_PROJECT_ID are required.\n' +
        '  Neon console → Project Settings → API keys\n' +
        '  Project ID is on the same settings page (or use Neon GitHub integration vars).',
    );
    process.exit(1);
  }

  const vercelToken = process.env.VERCEL_TOKEN?.trim();
  const vercelProjectId = process.env.VERCEL_PROJECT_ID?.trim();

  if (vercelToken && vercelProjectId) {
    console.log('Cleaning stale Vercel preview deployments (triggers Neon webhook cleanup)…');
    const vercelResult = await runVercelPreviewDeploymentCleanup({
      token: vercelToken,
      projectId: vercelProjectId,
      retentionDays: neonConfig.retentionDays,
      dryRun,
    });
    console.log(`Vercel preview deployments listed: ${vercelResult.listed}`);
    if (vercelResult.candidates.length) {
      console.log(
        `${dryRun ? 'Would delete' : 'Deleted'} ${vercelResult.candidates.length} Vercel preview deployment(s).`,
      );
      for (const d of vercelResult.candidates) {
        const ref = d.meta?.githubCommitRef ?? d.name;
        console.log(`  - ${d.uid} (${ref})`);
      }
    } else {
      console.log('No stale Vercel preview deployments.');
    }
    console.log('');
  }

  console.log('Cleaning Neon preview branches directly…');
  const neonResult = await runNeonBranchCleanup({ config: neonConfig, dryRun });
  printNeonResult(neonResult);

  if (neonResult.failed.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
