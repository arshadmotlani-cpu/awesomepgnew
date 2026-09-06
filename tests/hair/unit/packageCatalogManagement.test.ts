import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  computePackageDiscount,
  computePackageNormalValuePaise,
} from '@/src/hair/domain/packages/economics';
import { validatePackagePlanItems } from '@/src/hair/services/packagePlans';
import { codeTemplateForAccessRole } from '@/src/workforce/permissions/roleTemplates';
import { workforceGrantsToHairPermissions } from '@/src/workforce/compat/hairAdminBridge';
import { hasPermission, type PermissionAdmin } from '@/src/hair/lib/auth/permissionTypes';

const root = process.cwd();

function readSrc(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

function hairAdminFromRole(role: 'owner' | 'manager' | 'receptionist'): PermissionAdmin {
  const grants = codeTemplateForAccessRole(role);
  return {
    role: role === 'owner' ? 'super_admin' : 'admin',
    permissions: workforceGrantsToHairPermissions(grants),
  };
}

test('1 create economics: normal / discount / savings from services × qty', () => {
  const normal = computePackageNormalValuePaise([{ retailUnitPaise: 55_000, quantity: 15 }]);
  assert.equal(normal, 825_000);
  const d = computePackageDiscount(normal, 412_500);
  assert.equal(d.discountAmountPaise, 412_500);
  assert.equal(d.discountPercentDisplay, 50);
});

test('2 edit package name validation still requires non-empty items', () => {
  assert.doesNotThrow(() =>
    validatePackagePlanItems([{ serviceId: 'svc-a', quantity: 10 }]),
  );
});

test('3 edit linked service: items may swap service ids without duplicates', () => {
  assert.doesNotThrow(() =>
    validatePackagePlanItems([
      { serviceId: 'svc-wash', quantity: 15 },
      { serviceId: 'svc-spa', quantity: 5 },
    ]),
  );
});

test('4 edit quantity recalculates normal value', () => {
  const before = computePackageNormalValuePaise([{ retailUnitPaise: 55_000, quantity: 15 }]);
  const after = computePackageNormalValuePaise([{ retailUnitPaise: 55_000, quantity: 10 }]);
  assert.equal(before, 825_000);
  assert.equal(after, 550_000);
});

test('5 add service increases normal value', () => {
  const one = computePackageNormalValuePaise([{ retailUnitPaise: 55_000, quantity: 15 }]);
  const two = computePackageNormalValuePaise([
    { retailUnitPaise: 55_000, quantity: 15 },
    { retailUnitPaise: 80_000, quantity: 2 },
  ]);
  assert.equal(two - one, 160_000);
});

test('6 remove service decreases normal value', () => {
  const two = computePackageNormalValuePaise([
    { retailUnitPaise: 55_000, quantity: 15 },
    { retailUnitPaise: 80_000, quantity: 2 },
  ]);
  const one = computePackageNormalValuePaise([{ retailUnitPaise: 55_000, quantity: 15 }]);
  assert.equal(two - one, 160_000);
});

test('7 recalculate normal value after offer edit uses current retail', () => {
  const normal = computePackageNormalValuePaise([
    { retailUnitPaise: 60_000, quantity: 15 },
  ]);
  assert.equal(normal, 900_000);
});

test('8 recalculate discount after offer change', () => {
  const normal = 825_000;
  const d = computePackageDiscount(normal, 375_000);
  assert.equal(d.discountAmountPaise, 450_000);
  assert.equal(d.discountBps, Math.round((450_000 * 10000) / 825_000));
});

test('9 recalculate savings equals normal − offer', () => {
  const d = computePackageDiscount(825_000, 412_500);
  assert.equal(d.discountAmountPaise, 825_000 - 412_500);
});

test('10 cannot remove the final service', () => {
  assert.throws(
    () => validatePackagePlanItems([]),
    /at least one service/i,
  );
});

test('11 cannot use zero quantity', () => {
  assert.throws(
    () => validatePackagePlanItems([{ serviceId: 'svc-a', quantity: 0 }]),
    /positive/i,
  );
  assert.throws(
    () => validatePackagePlanItems([{ serviceId: 'svc-a', quantity: -1 }]),
    /positive/i,
  );
});

test('11b cannot duplicate the same service', () => {
  assert.throws(
    () =>
      validatePackagePlanItems([
        { serviceId: 'svc-a', quantity: 2 },
        { serviceId: 'svc-a', quantity: 3 },
      ]),
    /Duplicate service/i,
  );
});

test('12–13–17 entitlement snapshot fields are written once at purchase, not on plan update', () => {
  const credits = readSrc('src/hair/domain/packages/credits.ts');
  const plans = readSrc('src/hair/services/packagePlans.ts');
  const loyalty = readSrc('src/hair/services/loyaltyOps.ts');

  assert.match(credits, /offerPricePaise:\s*input\.offerPricePaise/);
  assert.match(credits, /normalValuePaise:\s*input\.normalValuePaise/);
  assert.match(credits, /effectiveUnitPaise/);
  assert.match(loyalty, /nameSnapshot:\s*plan\.name/);
  assert.match(loyalty, /createCustomerPackageEntitlement/);

  // updatePackagePlan only mutates fyhPackagePlans / fyhPackagePlanItems — never customer tables
  const updateStart = plans.indexOf('export async function updatePackagePlan');
  const updateEnd = plans.indexOf('export async function deactivatePackagePlan');
  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  const updateBody = plans.slice(updateStart, updateEnd);
  assert.doesNotMatch(updateBody, /fyhCustomerPackages|fyhCustomerPackageCredits|fyhPackageCreditLedger/);
});

test('14–15 deactivate sets isActive false; sell rejects inactive plans', () => {
  const plans = readSrc('src/hair/services/packagePlans.ts');
  const loyalty = readSrc('src/hair/services/loyaltyOps.ts');
  assert.match(plans, /export async function deactivatePackagePlan/);
  assert.match(plans, /isActive:\s*false/);
  assert.match(loyalty, /Package is not available for purchase/);
  assert.match(loyalty, /!plan\.isActive/);
});

test('16 existing credits remain usable after deactivation (list ignores plan.isActive)', () => {
  const credits = readSrc('src/hair/domain/packages/credits.ts');
  const available = readSrc('src/hair/domain/packages/availableServices.ts');
  const listFn = credits.slice(
    credits.indexOf('export async function listActivePackageCreditsForCustomer'),
    credits.indexOf('export async function createCustomerPackageEntitlement'),
  );
  assert.doesNotMatch(listFn, /fyhPackagePlans/);
  assert.match(listFn, /fyhCustomerPackages\.isActive/);
  assert.match(available, /clampRedemptionQty|buildRedemptionBasketLine/);
});

test('18 reactivatePackagePlan restores isActive true', () => {
  const plans = readSrc('src/hair/services/packagePlans.ts');
  assert.match(plans, /export async function reactivatePackagePlan/);
  const body = plans.slice(plans.indexOf('export async function reactivatePackagePlan'));
  assert.match(body, /isActive:\s*true/);
});

test('19 idempotent update path rewrites plan items without touching entitlements', () => {
  const plans = readSrc('src/hair/services/packagePlans.ts');
  assert.match(plans, /delete\(fyhPackagePlanItems\)/);
  assert.match(plans, /insert\(fyhPackagePlanItems\)/);
  assert.doesNotMatch(
    plans.slice(
      plans.indexOf('export async function updatePackagePlan'),
      plans.indexOf('export async function deactivatePackagePlan'),
    ),
    /usedCredits|effectiveUnitValuePaise/,
  );
});

test('20 authorization: package mutations require action:packages.edit; receptionist denied', () => {
  const actions = readSrc('src/hair/actions/packages.ts');
  assert.match(actions, /requirePermission\('action:packages\.edit'\)/);
  assert.match(actions, /updatePackagePlanAction/);
  assert.match(actions, /deactivatePackagePlanAction/);
  assert.match(actions, /reactivatePackagePlanAction/);

  const receptionist = hairAdminFromRole('receptionist');
  const manager = hairAdminFromRole('manager');
  assert.equal(hasPermission(receptionist, 'action:packages.edit'), false);
  assert.equal(hasPermission(receptionist, 'page:packages'), true);
  assert.equal(hasPermission(manager, 'action:packages.edit'), true);
});

test('Express Sale catalog stays active-only via listPackagePlans', () => {
  const loyalty = readSrc('src/hair/services/loyaltyOps.ts');
  const adapter = readSrc('src/hair/domain/catalog/adapter.ts');
  assert.match(loyalty, /eq\(fyhPackagePlans\.isActive,\s*true\)/);
  assert.match(adapter, /listPackagePlans/);
});

test('Packages UI exposes Edit · Deactivate / Activate and status', () => {
  const ui = readSrc('src/hair/components/packages/PackagesUi.tsx');
  assert.match(ui, /Edit/);
  assert.match(ui, /Deactivate/);
  assert.match(ui, /Activate/);
  assert.match(ui, /Deactivated/);
  assert.match(ui, /updatePackagePlanAction/);
  assert.match(ui, /Existing customer packages and unused credits will remain valid/);
});
