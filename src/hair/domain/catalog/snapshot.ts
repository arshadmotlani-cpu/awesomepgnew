import type { BillableItem } from '@/src/hair/domain/catalog/types';

export function billableItemToSnapshot(item: BillableItem) {
  return {
    name: item.name,
    code: item.code,
    unitSellingPricePaise: item.sellingPricePaise,
    gstBps: item.gstBps,
    staffMode: item.staffMode,
    category: item.category,
  };
}
