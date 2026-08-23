import type { Basket, BasketFlags, PaymentEntry } from '@/src/hair/domain/basket/types';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import { legacyLinesToBasket } from '@/src/hair/domain/basket/legacyBridge';
import { resolveBillableItem } from '@/src/hair/domain/catalog/adapter';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { billableItemToSnapshot } from '@/src/hair/domain/catalog/snapshot';
import type { QuickSaleLineInput } from '@/src/hair/services/invoices';

export async function buildBasketFromQuickSaleLines(
  customerId: string,
  lines: QuickSaleLineInput[],
  payments: PaymentEntry[] = [],
  flags: BasketFlags = {},
  ctx?: TenantContext | null,
): Promise<Basket> {
  const snapshots = new Map<string, BasketLine['snapshot']>();
  for (const line of lines) {
    const key = `${line.kind}-${line.refId}`;
    if (snapshots.has(key)) continue;
    const item = await resolveBillableItem(line.kind, line.refId, ctx);
    if (!item) throw new Error(`${line.kind} not found`);
    snapshots.set(key, billableItemToSnapshot(item));
  }
  const basket = legacyLinesToBasket(customerId, lines, snapshots);
  return { ...basket, payments, flags };
}
