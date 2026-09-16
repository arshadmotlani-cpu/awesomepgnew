import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Products master UX (list-first)', () => {
  it('/products page loads master with tenant context', () => {
    const page = read('app/(hair)/fyh/(app)/products/page.tsx');
    assert.match(page, /ProductsMaster/);
    assert.match(page, /getTenantContextForPage\(\)/);
    assert.match(page, /listVendors/);
  });

  it('/products/new redirects to list add drawer', () => {
    const page = read('app/(hair)/fyh/(app)/products/new/page.tsx');
    assert.match(page, /redirect\('\/products\?add=1'\)/);
  });

  it('ProductsMaster is list-first with on-demand drawer', () => {
    const ui = read('src/hair/components/products/ProductsUi.tsx');
    assert.match(ui, /export function ProductsMaster/);
    assert.match(ui, /Add product/);
    assert.match(ui, /ProductFormDrawer/);
    assert.match(ui, /No products yet/);
    assert.match(ui, /openingStockQty/);
    assert.match(ui, /adjustProductStockAction/);
    assert.match(ui, /Preferred vendor/);
    assert.match(ui, /md:hidden/);
    assert.match(ui, /max-w-6xl/);
    assert.doesNotMatch(ui, /href="\/products\/new"/);
  });

  it('create product returns to list and revalidates quick-sale', () => {
    const actions = read('src/hair/actions/products.ts');
    assert.match(actions, /returnToList/);
    assert.match(actions, /revalidatePath\('\/quick-sale'\)/);
    assert.match(actions, /adjustProductStock/);
    assert.match(actions, /findOrCreateBrand/);
  });

  it('stock adjustment is separate from product update', () => {
    const svc = read('src/hair/services/products.ts');
    assert.match(svc, /export async function adjustProductStock/);
    assert.doesNotMatch(svc, /stockAdjustmentReason/);
  });
});
