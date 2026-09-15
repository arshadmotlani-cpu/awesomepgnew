import type { Basket, BasketLine } from '@/src/hair/domain/basket/types';

/** Lines that must have a performer before checkout (Quick Sale SSOT). */
export function lineRequiresStaffPerformer(line: BasketLine): boolean {
  if (line.billableRef.type === 'package') return false;
  if (line.prepaidRedemption) return true;
  if (line.billableRef.type === 'service' && line.snapshot.staffMode === 'SERVICE') return true;
  return false;
}

export function findLinesMissingStaffPerformer(basket: Basket): BasketLine[] {
  return basket.lines.filter((line) => lineRequiresStaffPerformer(line) && line.staff.length === 0);
}

export type StaffRequiredCheckoutAlert = {
  title: string;
  intro: string;
  lineNames: string[];
  lineIds: string[];
};

export const STAFF_REQUIRED_CHECKOUT_TITLE = 'Cannot complete sale';

export function staffRequiredCheckoutDetail(lines: BasketLine[]): StaffRequiredCheckoutAlert {
  return {
    title: STAFF_REQUIRED_CHECKOUT_TITLE,
    intro: 'Select a staff member for every service before completing the sale.',
    lineNames: lines.map((l) => l.snapshot.name),
    lineIds: lines.map((l) => l.lineId),
  };
}

export function staffRequiredCheckoutErrorMessage(lines: BasketLine[]): string {
  const detail = staffRequiredCheckoutDetail(lines);
  const bullets = detail.lineNames.map((name) => `• ${name}`).join('\n');
  return `${detail.title}\nStaff member is required for:\n${bullets}\n${detail.intro}`;
}
