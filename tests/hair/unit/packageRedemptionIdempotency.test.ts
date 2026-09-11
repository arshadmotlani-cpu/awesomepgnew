import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadAppEnv } from '@/src/lib/db/loadEnv';

loadAppEnv();

import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import { fyhCustomerPackageCredits } from '@/src/hair/db/schema';
import { redeemPackageCredits } from '@/src/hair/domain/packages/credits';
import { assertHairIntegrationTestWritesAllowed, isProductionHairDatabaseUrl } from '@/src/hair/lib/db/integrationWriteGuard';
import { sellPackage } from '@/src/hair/services/loyaltyOps';
import { createRcCustomer, requireRcFixtures } from '../integration/rcFixtures';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

test('checkout pipeline uses stable redeem idempotency key invoiceId+creditId', () => {
  const pipeline = read('src/hair/domain/checkout/pipeline.ts');
  assert.match(pipeline, /idempotencyKey: `redeem:\$\{inv\.id\}:\$\{line\.prepaidRedemption\.creditId\}`/);
  assert.doesNotMatch(pipeline, /idempotencyKey: `redeem:\$\{invoiceLineId\}`/);
});

test('redeemPackageCredits is idempotent for the same business key', async (t) => {
  if (isProductionHairDatabaseUrl()) {
    t.skip('Requires non-production Hair database');
    return;
  }
  assertHairIntegrationTestWritesAllowed();

  const f = await requireRcFixtures();
  const customer = await createRcCustomer('pkg-redeem-idem');
  const { createPackagePlan } = await import('@/src/hair/services/packagePlans');
  const planDef = await createPackagePlan({
    name: `Redeem Idem ${Date.now()}`,
    offerPricePaise: 300_000,
    validityDays: null,
    items: [{ serviceId: f.cut.id, quantity: 15 }],
  });
  const plan = await sellPackage(customer.id, planDef.id);

  const [credit] = await hairDb
    .select()
    .from(fyhCustomerPackageCredits)
    .where(eq(fyhCustomerPackageCredits.customerPackageId, plan.id))
    .limit(1);
  assert.ok(credit);

  const invoiceId = `inv-test-${Date.now()}`;
  const invoiceLineId = `line-test-${Date.now()}`;
  const idempotencyKey = `redeem:${invoiceId}:${credit!.id}`;

  const first = await redeemPackageCredits(hairDb, {
    customerId: customer.id,
    creditId: credit!.id,
    quantity: 1,
    invoiceId,
    invoiceLineId,
    idempotencyKey,
  });
  assert.equal(first.effectiveValuePaise, credit!.effectiveUnitValuePaise);

  const [afterFirst] = await hairDb
    .select()
    .from(fyhCustomerPackageCredits)
    .where(eq(fyhCustomerPackageCredits.id, credit!.id))
    .limit(1);
  assert.equal(afterFirst!.usedCredits, 1);

  const second = await redeemPackageCredits(hairDb, {
    customerId: customer.id,
    creditId: credit!.id,
    quantity: 1,
    invoiceId,
    invoiceLineId: `${invoiceLineId}-retry`,
    idempotencyKey,
  });
  assert.equal(second.effectiveValuePaise, first.effectiveValuePaise);

  const [afterSecond] = await hairDb
    .select()
    .from(fyhCustomerPackageCredits)
    .where(eq(fyhCustomerPackageCredits.id, credit!.id))
    .limit(1);
  assert.equal(afterSecond!.usedCredits, 1);
});
