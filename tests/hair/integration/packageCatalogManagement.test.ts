import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { and, eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerPackageCredits,
  fyhCustomerPackages,
  fyhPackagePlanItems,
  fyhPackagePlans,
} from '@/src/hair/db/schema';
import { listActivePackageCreditsForCustomer } from '@/src/hair/domain/packages/credits';
import { assertHairIntegrationTestWritesAllowed, isProductionHairDatabaseUrl } from '@/src/hair/lib/db/integrationWriteGuard';
import {
  createPackagePlan,
  deactivatePackagePlan,
  reactivatePackagePlan,
  updatePackagePlan,
} from '@/src/hair/services/packagePlans';
import { sellPackage } from '@/src/hair/services/loyaltyOps';
import { createRcCustomer, requireRcFixtures } from './rcFixtures';

test('package catalog: edit / deactivate / reactivate preserves purchased entitlements', async (t) => {
  if (isProductionHairDatabaseUrl()) {
    t.skip('Requires non-production Hair database (staging / HAIR_TEST_DATABASE_URL)');
    return;
  }
  assertHairIntegrationTestWritesAllowed();
  const f = await requireRcFixtures();
  const customer = await createRcCustomer('pkg-catalog');

  const plan = await createPackagePlan({
    name: `Catalog Mgmt Pack ${Date.now()}`,
    offerPricePaise: 150_000,
    validityDays: null,
    items: [{ serviceId: f.cut.id, quantity: 5 }],
  });

  const purchased = await sellPackage(customer.id, plan.id);
  assert.equal(purchased.offerPricePaise, 150_000);
  assert.equal(purchased.nameSnapshot, plan.name);

  const [creditBefore] = await hairDb
    .select()
    .from(fyhCustomerPackageCredits)
    .where(eq(fyhCustomerPackageCredits.customerPackageId, purchased.id))
    .limit(1);
  assert.ok(creditBefore);
  const snapshot = {
    offer: purchased.offerPricePaise,
    normal: purchased.normalValuePaise,
    name: purchased.nameSnapshot,
    totalCredits: creditBefore!.totalCredits,
    effective: creditBefore!.effectiveUnitValuePaise,
  };

  await updatePackagePlan(plan.id, {
    name: `${plan.name} EDITED`,
    offerPricePaise: 120_000,
    validityDays: 30,
    items: [
      { serviceId: f.cut.id, quantity: 3 },
      { serviceId: f.blow.id, quantity: 2 },
    ],
  });

  const [planAfter] = await hairDb
    .select()
    .from(fyhPackagePlans)
    .where(eq(fyhPackagePlans.id, plan.id))
    .limit(1);
  assert.equal(planAfter!.pricePaise, 120_000);
  assert.equal(planAfter!.name, `${plan.name} EDITED`);

  const itemsAfter = await hairDb
    .select()
    .from(fyhPackagePlanItems)
    .where(eq(fyhPackagePlanItems.planId, plan.id));
  assert.equal(itemsAfter.length, 2);

  const [entitlementAfter] = await hairDb
    .select()
    .from(fyhCustomerPackages)
    .where(eq(fyhCustomerPackages.id, purchased.id))
    .limit(1);
  const [creditAfter] = await hairDb
    .select()
    .from(fyhCustomerPackageCredits)
    .where(eq(fyhCustomerPackageCredits.customerPackageId, purchased.id))
    .limit(1);

  assert.equal(entitlementAfter!.offerPricePaise, snapshot.offer);
  assert.equal(entitlementAfter!.normalValuePaise, snapshot.normal);
  assert.equal(entitlementAfter!.nameSnapshot, snapshot.name);
  assert.equal(creditAfter!.totalCredits, snapshot.totalCredits);
  assert.equal(creditAfter!.effectiveUnitValuePaise, snapshot.effective);

  // Idempotent update (same payload again)
  await updatePackagePlan(plan.id, {
    name: `${plan.name} EDITED`,
    offerPricePaise: 120_000,
    validityDays: 30,
    items: [
      { serviceId: f.cut.id, quantity: 3 },
      { serviceId: f.blow.id, quantity: 2 },
    ],
  });

  await deactivatePackagePlan(plan.id);
  const [deactivated] = await hairDb
    .select()
    .from(fyhPackagePlans)
    .where(eq(fyhPackagePlans.id, plan.id))
    .limit(1);
  assert.equal(deactivated!.isActive, false);

  await assert.rejects(() => sellPackage(customer.id, plan.id), /not available for purchase/i);

  const available = await listActivePackageCreditsForCustomer(hairDb, customer.id);
  assert.ok(available.some((c) => c.customerPackageId === purchased.id && c.remainingCredits > 0));

  await reactivatePackagePlan(plan.id);
  const [reactivated] = await hairDb
    .select()
    .from(fyhPackagePlans)
    .where(and(eq(fyhPackagePlans.id, plan.id), eq(fyhPackagePlans.isActive, true)))
    .limit(1);
  assert.ok(reactivated);

  // Cleanup: leave plan deactivated so Express Sale stays clean
  await deactivatePackagePlan(plan.id);
});
