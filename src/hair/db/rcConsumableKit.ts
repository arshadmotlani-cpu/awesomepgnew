import { eq } from 'drizzle-orm';
import type { createHairClient } from '@/src/hair/db/client';
import { fyhServiceConsumables } from '@/src/hair/db/schema';

type HairDb = ReturnType<typeof createHairClient>['db'];

/** RC Haircut kit: idempotent upsert for integration tests and seed. */
export async function ensureRcCutConsumableKit(
  db: HairDb,
  serviceId: string,
  productId: string,
  quantity = 10,
) {
  const kits = await db
    .select()
    .from(fyhServiceConsumables)
    .where(eq(fyhServiceConsumables.serviceId, serviceId));
  const [primary, ...duplicates] = kits;
  for (const dup of duplicates) {
    await db.delete(fyhServiceConsumables).where(eq(fyhServiceConsumables.id, dup.id));
  }
  if (!primary) {
    await db.insert(fyhServiceConsumables).values({
      serviceId,
      productId,
      quantity,
      deductInventory: true,
    });
    return;
  }
  await db
    .update(fyhServiceConsumables)
    .set({
      productId,
      quantity,
      deductInventory: true,
    })
    .where(eq(fyhServiceConsumables.id, primary.id));
}
