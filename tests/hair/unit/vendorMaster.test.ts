import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  emptyVendorFormValues,
  parseBrandNamesJson,
  validateVendorFormValues,
} from '@/src/hair/lib/vendorConfigurationForm';

const root = join(process.cwd());

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('FYH Vendor Master architecture', () => {
  it('products page has separate Add vendor action, not inside product form', () => {
    const ui = read('src/hair/components/products/ProductsUi.tsx');
    assert.match(ui, /Add vendor/);
    assert.match(ui, /VendorFormDrawer/);
    assert.doesNotMatch(ui, /quickCreateVendorForProductAction/);
    assert.doesNotMatch(ui, /\+ Add vendor.*ProductFormFields/s);
  });

  it('product form filters brands by selected vendor and clears incompatible brand', () => {
    const ui = read('src/hair/components/products/ProductsUi.tsx');
    assert.match(ui, /b\.vendorId === values\.vendorId/);
    assert.match(ui, /onVendorChange/);
    assert.match(ui, /brand\.vendorId !== vendorId/);
  });

  it('product creation does not create vendors', () => {
    const actions = read('src/hair/actions/products.ts');
    assert.doesNotMatch(actions, /createVendor/);
    assert.doesNotMatch(actions, /quickCreateVendor/);
    const svc = read('src/hair/services/products.ts');
    assert.doesNotMatch(svc, /createVendor/);
  });

  it('product service enforces brand belongs to selected vendor', () => {
    const svc = read('src/hair/services/products.ts');
    assert.match(svc, /assertBrandAllowedForVendor/);
  });

  it('vendor create is atomic with brand sync in transaction', () => {
    const vendors = read('src/hair/services/vendors.ts');
    assert.match(vendors, /hairDb\.transaction/);
    assert.match(vendors, /syncVendorBrandsInDb/);
    assert.match(vendors, /assertUniqueVendorNameInDb/);
    const brands = read('src/hair/services/brands.ts');
    assert.match(brands, /syncVendorBrandsInDb/);
    assert.match(brands, /eq\(fyhBrands\.vendorId, vendorId\)/);
  });

  it('vendor master action validates phone and preserves values on error', () => {
    const action = read('src/hair/actions/vendors.ts');
    assert.match(action, /validateVendorFormValues/);
    assert.match(action, /fieldErrors/);
    assert.match(action, /values/);
    assert.match(action, /uploadVendorAttachment/);
  });

  it('vendor form validation requires name and phone', () => {
    const invalid = validateVendorFormValues(emptyVendorFormValues());
    assert.equal(invalid.ok, false);
    if (!invalid.ok) {
      assert.ok(invalid.fieldErrors.name);
      assert.ok(invalid.fieldErrors.phone);
    }
    const ok = validateVendorFormValues({
      ...emptyVendorFormValues(),
      name: 'SWANI ENTERPRISES',
      phone: '9876543210',
      brandNames: ['WELLA', "L'OREAL"],
    });
    assert.equal(ok.ok, true);
  });

  it('brand names json parses multiple brands', () => {
    const names = parseBrandNamesJson(JSON.stringify(['BEAUTY GARAGE', 'WELLA']));
    assert.deepEqual(names, ['BEAUTY GARAGE', 'WELLA']);
  });

  it('vendor schema has structured bank columns and brand relationship via fyh_brands', () => {
    const schema = read('src/hair/db/schema/vendors.ts');
    assert.match(schema, /bankAccountHolderName/);
    assert.match(schema, /bankIfsc/);
    const brands = read('src/hair/db/schema/brands.ts');
    assert.match(brands, /vendorId/);
  });

  it('tenant context used in vendor and brand services', () => {
    const vendors = read('src/hair/services/vendors.ts');
    assert.match(vendors, /orgFilter\(fyhVendors\.organizationId, ctx\)/);
    const brands = read('src/hair/services/brands.ts');
    assert.match(brands, /orgFilter\(fyhBrands\.organizationId, ctx\)/);
  });
});
