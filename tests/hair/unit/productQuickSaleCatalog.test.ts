import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { mapProductToBillableItem } from '@/src/hair/domain/catalog/adapter';
import { priceBasket } from '@/src/hair/domain/basket/engine';
import type { BasketLine } from '@/src/hair/domain/basket/types';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Product catalog → Quick Sale → staff performance', () => {
  it('loadBillableCatalog uses listBookableRetailProducts SSOT', () => {
    const adapter = read('src/hair/domain/catalog/adapter.ts');
    assert.match(adapter, /listBookableRetailProducts\(ctx\)/);
    assert.match(adapter, /mapProductToBillableItem/);
  });

  it('product actions resolve tenant and revalidate quick-sale', () => {
    const actions = read('src/hair/actions/products.ts');
    assert.match(actions, /getTenantContextForAction\(\)/);
    assert.match(actions, /revalidatePath\('\/quick-sale'\)/);
    assert.match(actions, /category:/);
  });

  it('retail product requires selling price in server validation', () => {
    const products = read('src/hair/services/products.ts');
    assert.match(products, /Retail products require a selling price/);
    assert.match(products, /Product name is required/);
    assert.match(products, /Brand is required/);
  });

  it('mapProductToBillableItem carries canonical price for Quick Sale', () => {
    const item = mapProductToBillableItem({
      id: 'p1',
      organizationId: 'org-1',
      name: 'Keratin Shampoo',
      brandId: 'b1',
      brandName: 'FYH',
      category: 'Hair care',
      description: null,
      supplier: null,
      batchNumber: null,
      expiryDate: null,
      productType: 'retail',
      sellingPricePaise: 129900,
      costPricePaise: 80000,
      stockQty: 5,
      openingStock: 5,
      minStock: 0,
      isActive: true,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.equal(item.sellingPricePaise, 129900);
    assert.equal(item.type, 'product');
  });

  it('product sold_by staff attribution survives priceBasket', () => {
    const line: BasketLine = {
      lineId: 'pl1',
      billableRef: { id: 'p1', type: 'product' },
      snapshot: {
        name: 'Serum',
        code: null,
        unitSellingPricePaise: 100_000,
        gstBps: 1800,
        staffMode: 'SALE',
        category: 'Retail',
      },
      quantity: 1,
      overridePricePaise: null,
      staff: [{ staffId: 'stylist-1', shareBps: 10_000 }],
    };
    const priced = priceBasket({
      customerId: 'c1',
      lines: [line],
      payments: [],
      flags: {},
    });
    assert.equal(priced.attributions.length, 1);
    assert.equal(priced.attributions[0]!.staffId, 'stylist-1');
    assert.equal(priced.attributions[0]!.revenueMetric, 'product');
    assert.ok(priced.attributions[0]!.attributedBasePaise > 0);
  });
});
