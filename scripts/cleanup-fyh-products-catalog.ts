#!/usr/bin/env npx tsx
/**
 * One-time org-scoped FYH product catalog cleanup.
 *
 * Dry run (default):
 *   npx tsx scripts/cleanup-fyh-products-catalog.ts
 *
 * Execute on production:
 *   CONFIRM_FYH_PRODUCT_CATALOG_CLEANUP=1 npx tsx scripts/cleanup-fyh-products-catalog.ts --execute
 */
import {
  loadProductionCutoverEnv,
  PRODUCTION_HAIR_HOST_FRAGMENT,
  requireProductionHairReadOnlyEnv,
} from '@/src/lib/db/loadProductionCutoverEnv';
import { createHairClient } from '@/src/hair/db/client';
import { getHairDatabaseHost } from '@/src/hair/lib/db/env';
import {
  auditFyhProductsForOrganization,
  cleanupFyhProductCatalogForOrganization,
  countActiveProducts,
  countRelatedEntities,
  resolveFyhProductionOrganizationId,
} from './lib/fyhProductCatalogCleanup';

loadProductionCutoverEnv();

const execute = process.argv.includes('--execute');

function orgIdArg(): string | undefined {
  const hit = process.argv.find((a) => a.startsWith('--org-id='));
  return hit?.slice('--org-id='.length);
}

function resolveHairHost(): string {
  return getHairDatabaseHost() ?? '';
}

async function main() {
  const host = resolveHairHost();
  console.log(`Hair DB host: ${host}`);
  const isProd = host.includes(PRODUCTION_HAIR_HOST_FRAGMENT);
  console.log(`Production Hair: ${isProd ? 'yes' : 'no'}`);

  if (execute) {
    requireProductionHairReadOnlyEnv();
    if (process.env.CONFIRM_FYH_PRODUCT_CATALOG_CLEANUP !== '1') {
      throw new Error(
        'Set CONFIRM_FYH_PRODUCT_CATALOG_CLEANUP=1 to execute product catalog cleanup.',
      );
    }
  }

  const { db, close } = createHairClient({ max: 1 });
  try {
    const org = await resolveFyhProductionOrganizationId(db, orgIdArg());
    const before = await auditFyhProductsForOrganization(db, org.organizationId);
    const relatedBefore = await countRelatedEntities(db, org.organizationId);

    console.log('\n=== Before ===');
    console.log('Organization:', org);
    console.log(`Products: ${before.length} (${before.filter((p) => p.isActive).length} active)`);
    console.log('Related entities:', relatedBefore);

    const result = await cleanupFyhProductCatalogForOrganization(db, org.organizationId, {
      dryRun: !execute,
    });

    console.log('\n=== Cleanup plan / result ===');
    console.log(result);

    if (execute) {
      const activeAfter = await countActiveProducts(db, org.organizationId);
      const after = await auditFyhProductsForOrganization(db, org.organizationId);
      const relatedAfter = await countRelatedEntities(db, org.organizationId);

      console.log('\n=== After ===');
      console.log(`Active products: ${activeAfter}`);
      console.log(`Total products remaining: ${after.length}`);
      console.log('Related entities:', relatedAfter);

      if (activeAfter !== 0) {
        throw new Error(`Expected 0 active products after cleanup, got ${activeAfter}`);
      }
      if (relatedBefore.invoices !== relatedAfter.invoices) {
        throw new Error('Invoice count changed — aborting verification');
      }
      if (relatedBefore.purchases !== relatedAfter.purchases) {
        throw new Error('Purchase count changed — aborting verification');
      }
      console.log('\nCleanup verified: active products = 0, invoices/purchases intact.');
    } else {
      console.log('\nDry run only — pass --execute with CONFIRM_FYH_PRODUCT_CATALOG_CLEANUP=1 to apply.');
    }
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
