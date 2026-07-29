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
  const [kit] = await db
    .select()
    .from(fyhServiceConsumables)
    .where(eq(fyhServiceConsumables.serviceId, serviceId))
    .limit(1);
  if (!kit) {
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
      quantity: kit.quantity ?? quantity,
      deductInventory: true,
    })
    .where(eq(fyhServiceConsumables.id, kit.id));
}
