import type { Basket, BasketLine, StaffAllocation } from '@/src/hair/domain/basket/types';
import type { BillableItem } from '@/src/hair/domain/catalog/types';
import { billableItemToSnapshot } from '@/src/hair/domain/catalog/snapshot';
import type { QuickSaleLineInput } from '@/src/hair/services/invoices';
import { normalizeEqualShares } from '@/src/hair/lib/attributionMath';

export function basketLineFromBillableItem(item: BillableItem, lineId?: string): BasketLine {
  return {
    lineId: lineId ?? `${item.type}-${item.id}-${Date.now()}`,
    billableRef: { id: item.id, type: item.type },
    snapshot: billableItemToSnapshot(item),
    quantity: 1,
    overridePricePaise: null,
    staff: [],
  };
}

export function legacyLinesToBasket(
  customerId: string,
  lines: QuickSaleLineInput[],
  snapshots: Map<string, BasketLine['snapshot']>,
): Basket {
  return {
    customerId,
    lines: lines.map((line, i) => {
      const key = `${line.kind}-${line.refId}`;
      const snapshot = snapshots.get(key);
      if (!snapshot) throw new Error(`Missing snapshot for ${key}`);
      const catalogGross = snapshot.unitSellingPricePaise * line.quantity;
      const lineDiscountPaise = Math.max(0, line.lineDiscountPaise ?? 0);
      const overridePricePaise =
        line.lineDiscountPaise != null || line.lineDiscountBps != null
          ? Math.max(0, catalogGross - lineDiscountPaise)
          : null;

      let staff: StaffAllocation[] = [];
      if (line.servicedBy?.length) {
        const hasShares = line.servicedBy.some((s) => s.shareBps != null);
        staff = hasShares
          ? line.servicedBy.map((s) => ({
              staffId: s.staffId,
              shareBps: s.shareBps ?? 0,
            }))
          : normalizeEqualShares(line.servicedBy.map((s) => s.staffId)).map((s) => ({
              staffId: s.staffId,
              shareBps: s.shareBps ?? 0,
            }));
      } else if (line.soldByStaffId ?? line.staffId) {
        staff = [{ staffId: (line.soldByStaffId ?? line.staffId)!, shareBps: 10_000 }];
      }

      return {
        lineId: `legacy-${i}-${line.kind}-${line.refId}`,
        billableRef: { id: line.refId, type: line.kind },
        snapshot,
        quantity: line.quantity,
        overridePricePaise,
        staff,
      };
    }),
    payments: [],
    flags: {},
  };
}

export function basketToLegacyLines(basket: Basket): QuickSaleLineInput[] {
  return basket.lines.map((line) => {
    const catalogGross = line.snapshot.unitSellingPricePaise * line.quantity;
    const finalPaise = line.overridePricePaise ?? catalogGross;
    const lineDiscountPaise = Math.max(0, catalogGross - finalPaise);
    const base: QuickSaleLineInput = {
      kind: line.billableRef.type,
      refId: line.billableRef.id,
      quantity: line.quantity,
      lineDiscountPaise,
    };
    if (line.snapshot.staffMode === 'SERVICE') {
      base.servicedBy = line.staff.map((s) => ({ staffId: s.staffId, shareBps: s.shareBps }));
      base.staffId = line.staff[0]?.staffId ?? null;
    } else {
      base.soldByStaffId = line.staff[0]?.staffId ?? null;
      base.staffId = line.staff[0]?.staffId ?? null;
    }
    return base;
  });
}
