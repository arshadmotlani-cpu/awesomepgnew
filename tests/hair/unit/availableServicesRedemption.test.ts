import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildAttributionPlan } from '../../../src/hair/domain/basket/attribution.ts';
import type { PricedLine } from '../../../src/hair/domain/basket/types.ts';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Available Services modal has no staff selector', () => {
  const modal = read('src/hair/components/quick-sale/AvailableServicesModal.tsx');
  assert.doesNotMatch(modal, /QuickSaleStaffRow/);
  assert.doesNotMatch(modal, /Performed by/);
  assert.doesNotMatch(modal, /Select the staff member who performed this service/);
  assert.doesNotMatch(modal, /staff: StaffAllocation\[\]/);
  assert.doesNotMatch(modal, /searchStaffForPosAction/);
});

test('Available Services selection is quantity-only (no staff field)', () => {
  const modal = read('src/hair/components/quick-sale/AvailableServicesModal.tsx');
  assert.match(modal, /export type AvailableServiceSelection/);
  assert.match(modal, /quantity: number/);
  assert.doesNotMatch(
    modal.slice(modal.indexOf('export type AvailableServiceSelection')),
    /staff/,
  );
});

test('Quick Sale adds prepaid basket lines with empty staff for basket selection', () => {
  const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
  const fn = shell.slice(shell.indexOf('addPrepaidSelections'), shell.indexOf('resetTransactionState'));
  assert.match(fn, /staff: \[\]/);
  assert.doesNotMatch(fn, /staff: sel\.staff/);
  assert.match(fn, /unitSellingPricePaise: sel\.effectiveUnitValuePaise/);
  assert.match(fn, /retailUnitValuePaise: catalog\?\.sellingPricePaise/);
});

test('Basket table shows package redemption discount percent and column order', () => {
  const table = read('src/hair/components/quick-sale/QuickSaleBasketTable.tsx');
  assert.match(table, /computePackageRedemptionUnitDiscount/);
  assert.match(table, /formatPackageRedemptionDiscountLabel/);
  assert.match(table, />Service</);
  assert.match(table, />Staff</);
  assert.match(table, />Qty</);
  assert.match(table, />Discount</);
  assert.doesNotMatch(table, /Prepaid \/ Package/);
  assert.doesNotMatch(table, /Package Redemption · Prepaid · ₹0/);
});

test('Available Services modal receives basketLines for draft-aware availability', () => {
  const modal = read('src/hair/components/quick-sale/AvailableServicesModal.tsx');
  const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(modal, /basketLines: BasketLine\[\]/);
  assert.match(modal, /sumDraftReservedQtyByCreditId/);
  assert.match(modal, /computeDraftAvailableCredits/);
  assert.match(shell, /basketLines=\{lines\}/);
});

test('Quick Sale preloads staff roster when customer sale step is active', () => {
  const shell = read('src/hair/components/quick-sale/QuickSaleShell.tsx');
  assert.match(shell, /listStaffForPosRosterAction/);
  assert.match(shell, /preloadedStaff/);
  assert.match(shell, /step !== 'sale' \|\| !customer/);
});

test('Basket staff row accepts preloaded roster for instant dropdown', () => {
  const fields = read('src/hair/components/quick-sale/QuickSaleStaffFields.tsx');
  assert.match(fields, /preloadedStaff/);
  assert.match(fields, /filterStaffHits/);
  assert.match(fields, /preloadedStaff && preloadedStaff\.length > 0/);
});

test('Basket table passes preloaded staff to staff row', () => {
  const table = read('src/hair/components/quick-sale/QuickSaleBasketTable.tsx');
  assert.match(table, /preloadedStaff/);
  assert.match(table, /preloadedStaff=\{preloadedStaff\}/);
});

test('package redemption performance: ₹3,000 / 15 = ₹200 per redeemed unit', () => {
  const line: PricedLine = {
    lineId: 'l1',
    billableRef: { id: 'svc-wash', type: 'service' },
    snapshot: {
      name: 'LUXURY HAIR WASH',
      code: null,
      unitSellingPricePaise: 0,
      gstBps: 0,
      staffMode: 'SERVICE',
      category: 'Package Redemption',
    },
    quantity: 1,
    catalogGrossPaise: 0,
    finalLinePaise: 0,
    discountPaise: 0,
    discountBps: 0,
    basePaise: 0,
    gstPaise: 0,
    staff: [{ staffId: 'stylist-1', shareBps: 10_000 }],
    serviceId: 'svc-wash',
    productId: null,
    packageId: null,
    membershipId: null,
    primaryStaffId: 'stylist-1',
    prepaidRedemption: {
      kind: 'package_redemption',
      customerPackageId: 'cp-1',
      creditId: 'cred-1',
      serviceId: 'svc-wash',
      packageName: 'Wash Pack',
      effectiveUnitValuePaise: 20_000,
      retailUnitValuePaise: 40_000,
    },
  };
  const rows = buildAttributionPlan([line]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.staffId, 'stylist-1');
  assert.equal(rows[0]!.attributedBasePaise, 20_000);
  assert.equal(rows[0]!.role, 'serviced_by');
});

test('package redemption performance scales with quantity', () => {
  const line: PricedLine = {
    lineId: 'l1',
    billableRef: { id: 'svc-wash', type: 'service' },
    snapshot: {
      name: 'LUXURY HAIR WASH',
      code: null,
      unitSellingPricePaise: 0,
      gstBps: 0,
      staffMode: 'SERVICE',
      category: 'Package Redemption',
    },
    quantity: 3,
    catalogGrossPaise: 0,
    finalLinePaise: 0,
    discountPaise: 0,
    discountBps: 0,
    basePaise: 0,
    gstPaise: 0,
    staff: [{ staffId: 'stylist-1', shareBps: 10_000 }],
    serviceId: 'svc-wash',
    productId: null,
    packageId: null,
    membershipId: null,
    primaryStaffId: 'stylist-1',
    prepaidRedemption: {
      kind: 'package_redemption',
      customerPackageId: 'cp-1',
      creditId: 'cred-1',
      serviceId: 'svc-wash',
      packageName: 'Wash Pack',
      effectiveUnitValuePaise: 20_000,
      retailUnitValuePaise: 40_000,
    },
  };
  const rows = buildAttributionPlan([line]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.attributedBasePaise, 60_000);
});

test('package purchase still creates no staff performance', () => {
  const line: PricedLine = {
    lineId: 'l1',
    billableRef: { id: 'pkg-1', type: 'package' },
    snapshot: {
      name: 'Wash Pack',
      code: null,
      unitSellingPricePaise: 300_000,
      gstBps: 0,
      staffMode: 'SALE',
      category: null,
    },
    quantity: 1,
    catalogGrossPaise: 300_000,
    finalLinePaise: 300_000,
    discountPaise: 0,
    discountBps: 0,
    basePaise: 300_000,
    gstPaise: 0,
    staff: [{ staffId: 'stylist-1', shareBps: 10_000 }],
    serviceId: null,
    productId: null,
    packageId: 'pkg-1',
    membershipId: null,
    primaryStaffId: 'stylist-1',
  };
  assert.equal(buildAttributionPlan([line]).length, 0);
});

test('POS staff roster uses tenant-scoped listBookableStaffForSalon SSOT', () => {
  const service = read('src/hair/services/quickSale.ts');
  const rosterFn = service.slice(
    service.indexOf('export async function listStaffForPosRoster'),
    service.indexOf('export async function searchStaffForPos'),
  );
  assert.match(rosterFn, /resolveTenantContextForService/);
  assert.match(rosterFn, /listBookableStaffForSalon/);
});
