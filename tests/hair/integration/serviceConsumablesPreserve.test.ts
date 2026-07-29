import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAppEnv } from '../../../src/lib/db/loadEnv.ts';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { hairDb } from '../../../src/hair/db/client.ts';
import { fyhServiceConsumables } from '../../../src/hair/db/schema/index.ts';
import {
  getServiceConsumables,
  getServiceDetail,
  updateService,
} from '../../../src/hair/services/salonServices.ts';
import { requireRcFixtures } from './rcFixtures.ts';

test('updateService preserves deductInventory when only service name changes', async () => {
  const f = await requireRcFixtures();
  const detail = await getServiceDetail(f.cut.id);
  assert.ok(detail);

  const kitsBefore = await getServiceConsumables(f.cut.id);
  assert.ok(kitsBefore.some((k) => k.deductInventory === true), 'RC cut should deduct stock');

  const consumables = kitsBefore.map((k) => ({
    productId: k.productId,
    quantity: Number(k.quantity),
    deductInventory: k.deductInventory,
  }));

  await updateService(f.cut.id, {
    name: `${detail.service.name} UAT`,
    category: detail.service.category ?? 'Hair',
    durationMinutes: detail.service.durationMinutes,
    sellingPriceRupees: detail.service.pricePaise / 100,
    costPriceRupees: detail.service.costPricePaise / 100,
    gstPercent: detail.service.gstBps / 100,
    commissionType: detail.service.commissionType,
    commissionFixedRupees: detail.service.commissionFixedPaise / 100,
    commissionPercent: detail.service.commissionPercentBps / 100,
    overrideStaffCommission: detail.service.overrideStaffCommission,
    availableOnline: detail.service.availableOnline,
    featured: detail.service.featured,
    showOnWebsite: detail.service.showOnWebsite,
    isActive: detail.service.isActive,
    staffIds: detail.staffIds,
    consumables,
  });

  const kitsAfter = await hairDb
    .select()
    .from(fyhServiceConsumables)
    .where(eq(fyhServiceConsumables.serviceId, f.cut.id));
  const beforeDeduct = kitsBefore.find((k) => k.productId === f.product.id)?.deductInventory;
  const afterRow = kitsAfter.find((k) => k.productId === f.product.id);
  assert.ok(afterRow);
  assert.equal(afterRow!.deductInventory, beforeDeduct);
  assert.equal(afterRow!.deductInventory, true);
});

test('updateService preserves deductInventory when consumables omit explicit flag', async () => {
  const f = await requireRcFixtures();
  const detail = await getServiceDetail(f.cut.id);
  assert.ok(detail);

  await updateService(f.cut.id, {
    name: detail.service.name,
    category: detail.service.category ?? 'Hair',
    durationMinutes: detail.service.durationMinutes,
    sellingPriceRupees: detail.service.pricePaise / 100,
    costPriceRupees: detail.service.costPricePaise / 100,
    gstPercent: detail.service.gstBps / 100,
    isActive: true,
    staffIds: detail.staffIds,
    consumables: [{ productId: f.product.id, quantity: 10 }],
  });

  const [kit] = await hairDb
    .select()
    .from(fyhServiceConsumables)
    .where(eq(fyhServiceConsumables.serviceId, f.cut.id))
    .limit(1);
  assert.ok(kit);
  assert.equal(kit!.deductInventory, true);
});

test('updateService preserves staffIds when staffIds omitted', async () => {
  const f = await requireRcFixtures();
  const detail = await getServiceDetail(f.cut.id);
  assert.ok(detail);
  assert.ok(detail.staffIds.length > 0, 'RC cut should have staff linked');

  await updateService(f.cut.id, {
    name: detail.service.name,
    category: detail.service.category ?? 'Hair',
    durationMinutes: detail.service.durationMinutes,
    sellingPriceRupees: detail.service.pricePaise / 100,
    costPriceRupees: detail.service.costPricePaise / 100,
    isActive: true,
  });

  const after = await getServiceDetail(f.cut.id);
  assert.ok(after);
  assert.deepEqual(after!.staffIds.sort(), detail.staffIds.sort());
});
