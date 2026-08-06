import { productMarginPercent, productProfitPaise } from '@/src/hair/lib/productTypes';
import { SALON_GST_BPS } from '@/src/hair/lib/taxConfig';
import assert from 'node:assert/strict';
import test from 'node:test';

test('retail profit and margin are computed automatically', () => {
  const product = {
    productType: 'retail' as const,
    sellingPricePaise: 50000,
    costPricePaise: 30000,
  };
  assert.equal(productProfitPaise(product), 20000);
  assert.equal(productMarginPercent(product), 40);
});

test('professional products have zero retail profit', () => {
  const product = {
    productType: 'professional' as const,
    sellingPricePaise: 0,
    costPricePaise: 20000,
  };
  assert.equal(productProfitPaise(product), 0);
});

test('salon GST is fixed at 18%', () => {
  assert.equal(SALON_GST_BPS, 1800);
});
