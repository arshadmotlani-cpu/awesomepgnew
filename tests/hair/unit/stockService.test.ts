import assert from 'node:assert/strict';
import test from 'node:test';
import { eq } from 'drizzle-orm';
import { loadAppEnv } from '@/src/lib/db/loadEnv';

loadAppEnv();

import { hairDb } from '@/src/hair/db/client';
import { fyhProducts, fyhStockMovements } from '@/src/hair/db/schema';
import { applyMovement, getOnHand } from '@/src/hair/services/stock';
import { updateInventorySettings } from '@/src/hair/services/settings';

async function createTestProduct(suffix: string) {
  const [row] = await hairDb
    .insert(fyhProducts)
    .values({
      name: `Stock Test ${suffix}`,
      sku: `ST-${suffix}-${Date.now()}`,
      sellingPricePaise: 10_000,
      costPricePaise: 5_000,
      stockQty: 0,
      isActive: true,
    })
    .returning();
  return row!;
}

test('applyMovement rejects negative stock when allowNegativeStock is false', async () => {
  await updateInventorySettings({ inventorySettings: { allowNegativeStock: false } });
  const product = await createTestProduct('neg');

  await applyMovement(hairDb, {
    productId: product.id,
    quantityDelta: 5,
    movementType: 'opening',
    notes: 'test seed',
  });

  await applyMovement(hairDb, {
    productId: product.id,
    quantityDelta: -5,
    movementType: 'adjustment',
    notes: 'test zero out',
  });

  assert.equal(await getOnHand(product.id), 0);

  await assert.rejects(
    () =>
      applyMovement(hairDb, {
        productId: product.id,
        quantityDelta: -1,
        movementType: 'adjustment',
        notes: 'test oversell',
      }),
    /Insufficient stock/,
  );
});

test('applyMovement populates quantity_after on ledger row', async () => {
  const product = await createTestProduct('after');
  const before = await getOnHand(product.id);
  const delta = 3;

  const movement = await applyMovement(hairDb, {
    productId: product.id,
    quantityDelta: delta,
    movementType: 'adjustment',
    notes: 'quantity_after test',
  });

  assert.ok(movement);
  assert.equal(Number(movement!.quantityAfter), before + delta);

  const [row] = await hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.id, movement!.id))
    .limit(1);
  assert.equal(Number(row?.quantityAfter), before + delta);
});
