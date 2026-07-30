import type { Basket, BasketLine } from '@/src/hair/domain/basket/types';

export function validateStaffAllocations(line: BasketLine): string | null {
  if (line.staff.length === 0) return null;
  if (line.snapshot.staffMode === 'SALE') {
    if (line.staff.length !== 1) return `${line.snapshot.name}: Sold By allows one staff only`;
    if (line.staff[0]!.shareBps !== 10_000) return `${line.snapshot.name}: Sold By must be 100%`;
    return null;
  }
  const sum = line.staff.reduce((s, x) => s + x.shareBps, 0);
  if (sum !== 10_000) {
    return `${line.snapshot.name}: Service By shares must total 100% (currently ${(sum / 100).toFixed(1)}%)`;
  }
  return null;
}

export function validateBasket(basket: Basket): string | null {
  if (!basket.customerId) return 'Select a customer';
  if (basket.lines.length === 0) return 'Add at least one item';
  for (const line of basket.lines) {
    const err = validateStaffAllocations(line);
    if (err) return err;
  }
  return null;
}
