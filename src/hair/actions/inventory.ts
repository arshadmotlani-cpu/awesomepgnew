'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/src/hair/lib/auth/permissions';
import { applyMovement } from '@/src/hair/services/stock';
import { hairDb } from '@/src/hair/db/client';

export type InventoryActionState = { error?: string; success?: string };

export async function adjustStockAction(input: {
  productId: string;
  quantityDelta: number;
  notes?: string | null;
}): Promise<InventoryActionState> {
  try {
    await requirePermission('action:inventory.adjust');
    await applyMovement(hairDb, {
      productId: input.productId,
      quantityDelta: input.quantityDelta,
      movementType: 'adjustment',
      notes: input.notes ?? null,
    });
    revalidatePath('/inventory');
    revalidatePath('/products');
    revalidatePath('/reports');
    return { success: 'Stock adjusted.' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Stock adjustment failed' };
  }
}
