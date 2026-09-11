import { computePackageDiscount } from '@/src/hair/domain/packages/economics';
import { formatInrFromPaise } from '@/src/hair/lib/money';

/** Historical invoice line text for a package purchase (frozen at sale time). */
export function formatPackagePurchaseInvoiceName(input: {
  packageName: string;
  normalValuePaise: number;
  offerPricePaise: number;
  validityDays: number | null;
  includedServices: Array<{ serviceName: string; quantity: number }>;
}): string {
  const discount = computePackageDiscount(input.normalValuePaise, input.offerPricePaise);
  const validity =
    input.validityDays == null ? 'Forever' : `${input.validityDays} days`;
  const included =
    input.includedServices.length === 0
      ? '—'
      : input.includedServices.map((s) => `${s.serviceName} × ${s.quantity}`).join(', ');
  return [
    input.packageName,
    `Included: ${included}`,
    `Regular ${formatInrFromPaise(input.normalValuePaise)}`,
    `Offer ${formatInrFromPaise(input.offerPricePaise)}`,
    `Discount ${discount.discountPercentDisplay.toFixed(0)}%`,
    `Validity ${validity}`,
  ].join(' · ');
}

export function formatPackageRedemptionInvoiceName(input: {
  serviceName: string;
  packageName: string;
  quantity: number;
  effectiveUnitValuePaise: number;
}): string {
  const qty = Math.max(1, Math.floor(Number(input.quantity) || 0));
  const unitValuePaise = Math.max(0, Math.floor(Number(input.effectiveUnitValuePaise) || 0));
  const packageValuePaise = unitValuePaise * qty;
  return [
    input.serviceName,
    'Package Redemption',
    `Qty ${qty}`,
    `Unit ${formatInrFromPaise(unitValuePaise)}`,
    `Value ${formatInrFromPaise(packageValuePaise)}`,
    'Prepaid ₹0',
    input.packageName,
  ].join(' · ');
}
