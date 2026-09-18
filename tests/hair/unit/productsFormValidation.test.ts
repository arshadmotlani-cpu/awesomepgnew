import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseProductConfigurationForm,
  productFormValuesFromFormData,
} from '@/src/hair/lib/productConfigurationForm';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

describe('parseProductConfigurationForm', () => {
  it('returns fieldErrors and values when brand is missing', () => {
    const fd = form({
      name: 'Shampoo',
      brandId: '',
      newBrandName: '',
      productType: 'retail',
      sellingPriceRupees: '100',
      costPriceRupees: '0',
      openingStockQty: '0',
      isActive: 'true',
    });
    const parsed = parseProductConfigurationForm(fd, { allowCost: true, includeOpeningStock: true });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.values.name, 'Shampoo');
    assert.match(parsed.fieldErrors.newBrandName ?? '', /brand/i);
  });

  it('allows new brand name without brandId', () => {
    const fd = form({
      name: 'Shampoo',
      brandId: '',
      newBrandName: 'Beauty Garage',
      vendorId: 'v1',
      productType: 'retail',
      sellingPriceRupees: '1296',
      costPriceRupees: '777',
      openingStockQty: '7',
      isActive: 'true',
    });
    const parsed = parseProductConfigurationForm(fd, { allowCost: true, includeOpeningStock: true });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.newBrandName, 'Beauty Garage');
    assert.equal(parsed.productInput.stockQty, 7);
  });

  it('rejects cost and opening stock without inventory permission', () => {
    const fd = form({
      name: 'Shampoo',
      brandId: 'b1',
      productType: 'retail',
      sellingPriceRupees: '100',
      costPriceRupees: '50',
      openingStockQty: '3',
      isActive: 'true',
    });
    const parsed = parseProductConfigurationForm(fd, { allowCost: false, includeOpeningStock: true });
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.ok(parsed.fieldErrors.costPriceRupees);
    assert.ok(parsed.fieldErrors.openingStockQty);
    assert.equal(productFormValuesFromFormData(fd).costPriceRupees, '50');
  });
});
