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
    lineGrossOverridePaise: null,
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
      const lineGross =
        line.lineGrossOverridePaise != null && line.lineGrossOverridePaise >= 0
          ? line.lineGrossOverridePaise
          : catalogGross;
      const lineDiscountPaise = Math.max(0, line.lineDiscountPaise ?? 0);
      const finalFromDiscount = Math.max(0, lineGross - lineDiscountPaise);
      const overridePricePaise =
        line.prepaidRedemption != null
          ? 0
          : line.lineDiscountPaise != null ||
              line.lineDiscountBps != null ||
              line.lineGrossOverridePaise != null
            ? finalFromDiscount
            : null;
      const lineGrossOverridePaise =
        line.lineGrossOverridePaise != null
          ? line.lineGrossOverridePaise
          : lineGross !== catalogGross
            ? lineGross
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
        lineGrossOverridePaise,
        overridePricePaise,
        staff,
        prepaidRedemption: line.prepaidRedemption
          ? {
              ...line.prepaidRedemption,
              retailUnitValuePaise: line.prepaidRedemption.retailUnitValuePaise ?? 0,
            }
          : null,
      };
    }),
    payments: [],
    flags: {},
  };
}

export function basketToLegacyLines(basket: Basket): QuickSaleLineInput[] {
  return basket.lines.map((line) => {
    const catalogGross = line.snapshot.unitSellingPricePaise * line.quantity;
    const lineGross = line.lineGrossOverridePaise ?? catalogGross;
    const finalPaise = line.prepaidRedemption
      ? 0
      : (line.overridePricePaise ?? lineGross);
    const lineDiscountPaise = Math.max(0, lineGross - finalPaise);
    const base: QuickSaleLineInput = {
      kind: line.billableRef.type,
      refId: line.billableRef.id,
      quantity: line.quantity,
      lineDiscountPaise,
      lineGrossOverridePaise: line.lineGrossOverridePaise ?? undefined,
      prepaidRedemption: line.prepaidRedemption ?? null,
    };
    if (line.snapshot.staffMode === 'SERVICE') {
      base.servicedBy = line.staff.map((s) => ({ staffId: s.staffId, shareBps: s.shareBps }));
      base.staffId = line.staff[0]?.staffId ?? null;
    } else if (line.billableRef.type === 'product' && line.staff.length > 1) {
      base.servicedBy = line.staff.map((s) => ({ staffId: s.staffId, shareBps: s.shareBps }));
      base.soldByStaffId = line.staff[0]?.staffId ?? null;
      base.staffId = line.staff[0]?.staffId ?? null;
    } else {
      base.soldByStaffId = line.staff[0]?.staffId ?? null;
      base.staffId = line.staff[0]?.staffId ?? null;
    }
    return base;
  });
}
