import type { Basket, BasketLine } from '@/src/hair/domain/basket/types';
import {
  findLinesMissingStaffPerformer,
  lineRequiresStaffPerformer,
  staffRequiredCheckoutErrorMessage,
} from '@/src/hair/domain/basket/staffRequired';

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

/** Canonical basket line validation — shared by Quick Sale UI and checkout pipeline. */
export function collectBasketLineValidationErrors(basket: Basket): string[] {
  const errors: string[] = [];
  if (!basket.customerId) errors.push('Select a customer');
  if (basket.lines.length === 0) errors.push('Add at least one item');

  const missingStaff = findLinesMissingStaffPerformer(basket);
  if (missingStaff.length > 0) {
    errors.push(staffRequiredCheckoutErrorMessage(missingStaff));
  }

  for (const line of basket.lines) {
    if (line.billableRef.type === 'package') continue;
    if (line.prepaidRedemption) {
      const err = validateStaffAllocations(line);
      if (err) errors.push(err);
      continue;
    }
    if (lineRequiresStaffPerformer(line) && line.staff.length === 0) continue;
    const err = validateStaffAllocations(line);
    if (err) errors.push(err);
  }

  return errors;
}

export function validateBasket(basket: Basket): string | null {
  const errors = collectBasketLineValidationErrors(basket);
  return errors[0] ?? null;
}

// Re-export for consumers that classify staff-required lines.
export { findLinesMissingStaffPerformer, lineRequiresStaffPerformer } from '@/src/hair/domain/basket/staffRequired';
