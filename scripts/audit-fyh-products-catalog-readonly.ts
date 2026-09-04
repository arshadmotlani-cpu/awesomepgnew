#!/usr/bin/env npx tsx
/**
 * READ-ONLY audit — FYH product catalog for production org.
 * Production mutation count: 0
 *
 * Usage:
 *   npx tsx scripts/audit-fyh-products-catalog-readonly.ts
 *   npx tsx scripts/audit-fyh-products-catalog-readonly.ts --org-id=<uuid>
 */
import { loadProductionCutoverEnv, PRODUCTION_HAIR_HOST_FRAGMENT } from '@/src/lib/db/loadProductionCutoverEnv';
import { createHairClient } from '@/src/hair/db/client';
import {
  auditFyhProductsForOrganization,
  countRelatedEntities,
  resolveFyhProductionOrganizationId,
} from './lib/fyhProductCatalogCleanup';

loadProductionCutoverEnv();

function orgIdArg(): string | undefined {
  const hit = process.argv.find((a) => a.startsWith('--org-id='));
  return hit?.slice('--org-id='.length);
}

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
  console.log(`Hair DB host: ${host}`);
  console.log(`Production Hair: ${host.includes(PRODUCTION_HAIR_HOST_FRAGMENT) ? 'yes' : 'no'}`);
  console.log('Mutation count: 0\n');

  const { db, close } = createHairClient({ max: 1 });
  try {
    const org = await resolveFyhProductionOrganizationId(db, orgIdArg());
    console.log('Organization:', org);
    console.log('');

    const products = await auditFyhProductsForOrganization(db, org.organizationId);
    console.log(`Total products: ${products.length}`);
    console.log(`Active products: ${products.filter((p) => p.isActive).length}`);
    console.log('');

    for (const p of products) {
      console.log(`— ${p.name} (${p.id})`);
      console.log(`  brand: ${p.brandName} | type: ${p.productType} | active: ${p.isActive} | stock: ${p.stockQty}`);
      console.log(
        `  refs: invoices=${p.invoiceLines} movements=${p.stockMovements} purchases=${p.purchaseLines} PO=${p.purchaseOrderLines} GRN=${p.goodsReceiptLines} returns=${p.purchaseReturnLines} consumables=${p.serviceConsumables}`,
      );
      console.log(`  proposed: ${p.proposedAction}${p.blockers.length ? ` (blockers: ${p.blockers.join(', ')})` : ''}`);
    }

    const related = await countRelatedEntities(db, org.organizationId);
    console.log('\nUnrelated entity counts (must remain untouched):');
    console.log(related);

    console.log('\nSummary:');
    console.log(`  DELETE: ${products.filter((p) => p.proposedAction === 'DELETE').length}`);
    console.log(`  ARCHIVE: ${products.filter((p) => p.proposedAction === 'ARCHIVE').length}`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
