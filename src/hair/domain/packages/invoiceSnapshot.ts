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
}): string {
  return `${input.serviceName} · Package Redemption · Qty ${input.quantity} · Prepaid ₹0 · ${input.packageName}`;
}
