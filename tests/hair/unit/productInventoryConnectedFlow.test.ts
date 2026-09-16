import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { orgFilter, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { fyhProducts } from '@/src/hair/db/schema';
import { explainPurchase } from '@/src/hair/lib/purchaseExplain';
import { lineRequiresStaffPerformer } from '@/src/hair/domain/basket/staffRequired';
import type { BasketLine } from '@/src/hair/domain/basket/types';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Product inventory connected flow (SaaS + SSOT)', () => {
  it('new product page resolves tenant before listBrands', () => {
    const page = read('app/(hair)/fyh/(app)/products/new/page.tsx');
    assert.match(page, /getTenantContextForPage\(\)/);
    assert.match(page, /listBrands\(ctx\)/);
  });

  it('listBrands resolves tenant context for orgFilter', () => {
    const brands = read('src/hair/services/brands.ts');
    assert.match(brands, /resolveTenantContextForService\(ctx\)/);
    assert.match(brands, /orgFilter\(fyhBrands\.organizationId, ctx\)/);
  });

  it('product CRUD actions pass tenant context', () => {
    const actions = read('src/hair/actions/products.ts');
    assert.match(actions, /getTenantContextForAction\(\)/);
    assert.match(actions, /revalidatePath\('\/quick-sale'\)/);
  });

  it('createProduct uses movements for opening stock and duplicate identity guard', () => {
    const products = read('src/hair/services/products.ts');
    assert.match(products, /assertUniqueProductIdentity/);
    assert.match(products, /movementType: 'opening'/);
    assert.match(products, /Stock adjustment requires a reason/);
  });

  it('Quick Sale catalog uses listBookableRetailProducts SSOT', () => {
    const adapter = read('src/hair/domain/catalog/adapter.ts');
    assert.match(adapter, /listBookableRetailProducts\(ctx\)/);
    const qs = read('src/hair/services/quickSale.ts');
    assert.match(qs, /listBookableRetailProducts\(ctx\)/);
  });

  it('invoice paid path decrements product stock via applyMovement sale', () => {
    const invoices = read('src/hair/services/invoices.ts');
    assert.match(invoices, /movementType: 'sale'/);
    assert.match(invoices, /applyInventorySideEffects/);
  });

  it('createPurchase passes tenant ctx to stock movements and idempotency on vendor invoice ref', () => {
    const engine = read('src/hair/services/purchaseEngine.ts');
    assert.match(engine, /resolveTenantContextForService\(ctx\)/);
    assert.match(engine, /findPostedPurchaseByVendorInvoice/);
    assert.match(engine, /movementType: 'purchase'/);
    assert.match(engine, /applyMovement\([\s\S]*ctx/);
  });

  it('purchase actions forward tenant context', () => {
    const actions = read('src/hair/actions/purchases.ts');
    assert.match(actions, /getTenantContextForAction\(\)/);
    assert.match(actions, /createPurchase\([\s\S]*ctx/);
  });

  it('vendor payment explain partial and full due', () => {
    const partial = explainPurchase({
      purchase: { purchaseNumber: 'P1', totalPaise: 25_000_00, purchaseDate: '2026-09-01' },
      vendorName: 'ABC',
      payable: { balancePaise: 15_000_00, status: 'partial' },
    });
    assert.equal(partial.paidPaise, 10_000_00);
    assert.equal(partial.balancePaise, 15_000_00);

    const paid = explainPurchase({
      purchase: { purchaseNumber: 'P1', totalPaise: 25_000_00, purchaseDate: '2026-09-01' },
      vendorName: 'ABC',
      payable: { balancePaise: 0, status: 'paid' },
    });
    assert.equal(paid.paidPaise, 25_000_00);
    assert.equal(paid.balancePaise, 0);
    assert.equal(paid.payableStatus, 'paid');
  });

  it('service lines require staff; product lines do not', () => {
    const serviceLine: BasketLine = {
      lineId: 's1',
      billableRef: { id: 'svc', type: 'service' },
      snapshot: {
        name: 'Haircut',
        code: null,
        unitSellingPricePaise: 500_00,
        gstBps: 1800,
        staffMode: 'SERVICE',
        category: 'Hair',
      },
      quantity: 1,
      overridePricePaise: null,
      staff: [],
    };
    const productLine: BasketLine = {
      lineId: 'p1',
      billableRef: { id: 'prod', type: 'product' },
      snapshot: {
        name: 'Shampoo',
        code: null,
        unitSellingPricePaise: 100_00,
        gstBps: 1800,
        staffMode: 'SALE',
        category: 'Retail',
      },
      quantity: 1,
      overridePricePaise: null,
      staff: [],
    };
    assert.equal(lineRequiresStaffPerformer(serviceLine), true);
    assert.equal(lineRequiresStaffPerformer(productLine), false);
  });

  it('product writes fail closed without tenant when FYH_SAAS_TENANT=1', () => {
    const prev = process.env.FYH_SAAS_TENANT;
    process.env.FYH_SAAS_TENANT = '1';
    try {
      assert.equal(isFyhSaasTenantEnabled(), true);
      assert.throws(() => tenantOrgDefaults(null), /Tenant context is required/);
      assert.throws(
        () => orgFilter(fyhProducts.organizationId, null),
        /Tenant context is required/,
      );
    } finally {
      if (prev === undefined) delete process.env.FYH_SAAS_TENANT;
      else process.env.FYH_SAAS_TENANT = prev;
    }
  });
});
