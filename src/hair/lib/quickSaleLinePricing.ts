import { priceLineFromParts } from '@/src/hair/domain/basket/gstInclusiveMath';
import type { BasketLine } from '@/src/hair/domain/basket/types';
import {
  overridePricePaiseForDiscountPercent,
  wholeDiscountPercentFromBps,
} from '@/src/hair/lib/quickSaleDiscountPercent';

export function catalogGrossPaiseForLine(line: BasketLine): number {
  return Math.max(0, line.snapshot.unitSellingPricePaise * line.quantity);
}

/** POS line gross before discount — catalog unless receptionist overrides price for this sale. */
export function effectiveLineGrossPaise(line: BasketLine): number {
  if (line.prepaidRedemption) return 0;
  return line.lineGrossOverridePaise ?? catalogGrossPaiseForLine(line);
}

export function pricedPartsForBasketLine(line: BasketLine) {
  const catalogGross = catalogGrossPaiseForLine(line);
  const isPrepaid = Boolean(line.prepaidRedemption);
  const lineGross = isPrepaid ? catalogGross : effectiveLineGrossPaise(line);
  return priceLineFromParts({
    unitSellingPricePaise: line.snapshot.unitSellingPricePaise,
    quantity: line.quantity,
    gstBps: line.snapshot.gstBps,
    pricingGrossPaise: lineGross,
    overridePricePaise: isPrepaid ? 0 : line.overridePricePaise,
  });
}

export function discountPercentForLine(line: BasketLine): number {
  if (line.prepaidRedemption) return 0;
  return wholeDiscountPercentFromBps(pricedPartsForBasketLine(line).discountBps);
}

export function normalizeLineGrossOverride(line: BasketLine, lineGrossPaise: number): number | null {
  const catalog = catalogGrossPaiseForLine(line);
  return lineGrossPaise === catalog ? null : lineGrossPaise;
}

export function normalizeFinalOverride(lineGrossPaise: number, finalPaise: number): number | null {
  return finalPaise === lineGrossPaise ? null : finalPaise;
}

export function parseQuickSalePriceRupees(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || /^-/.test(trimmed)) return null;
  const n = Number(trimmed.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Reject invalid price edits; returns null when input should be ignored. */
export function patchLineFromPriceRupees(
  line: BasketLine,
  rupees: number | null,
): Partial<BasketLine> | null {
  if (rupees == null || !Number.isFinite(rupees) || rupees < 0) return null;
  if (line.prepaidRedemption) return null;
  const lineGross = Math.round(Math.max(0, rupees) * 100);
  const percent = discountPercentForLine(line);
  const finalPaise = overridePricePaiseForDiscountPercent(lineGross, percent);
  return {
    lineGrossOverridePaise: normalizeLineGrossOverride(line, lineGross),
    overridePricePaise: normalizeFinalOverride(lineGross, finalPaise),
  };
}

export function patchLineFromDiscountPercent(line: BasketLine, percent: number): Partial<BasketLine> {
  if (line.prepaidRedemption) return {};
  const lineGross = effectiveLineGrossPaise(line);
  const finalPaise = overridePricePaiseForDiscountPercent(lineGross, percent);
  return {
    overridePricePaise: normalizeFinalOverride(lineGross, finalPaise),
  };
}

export function patchLineQuantityChange(line: BasketLine, newQuantity: number): Partial<BasketLine> {
  const oldQty = line.quantity;
  const qty = Math.max(1, newQuantity);
  if (oldQty === qty) return { quantity: qty };

  const nextLine: BasketLine = { ...line, quantity: qty };
  let lineGrossOverride = line.lineGrossOverridePaise;
  if (lineGrossOverride != null && oldQty > 0) {
    const unitGross = lineGrossOverride / oldQty;
    lineGrossOverride = Math.round(unitGross * qty);
  }

  const withGross: BasketLine = {
    ...nextLine,
    lineGrossOverridePaise:
      lineGrossOverride != null
        ? normalizeLineGrossOverride(nextLine, lineGrossOverride)
        : null,
  };
  const lineGross = effectiveLineGrossPaise(withGross);
  const percent = discountPercentForLine(line);
  const finalPaise = overridePricePaiseForDiscountPercent(lineGross, percent);

  return {
    quantity: qty,
    lineGrossOverridePaise: withGross.lineGrossOverridePaise,
    overridePricePaise: normalizeFinalOverride(lineGross, finalPaise),
  };
}
