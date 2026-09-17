import { isPackageRedemptionLineName } from '@/src/hair/domain/packages/availableServices';

export type InvoiceLineServiceRef = {
  serviceId: string | null;
  nameSnapshot: string;
};

/** Canonical configured service selling price (paise) for package-redemption invoice lines. */
export function linkedServiceRetailUnitPaise(
  line: InvoiceLineServiceRef,
  serviceSellingPricePaiseById: Readonly<Record<string, number>>,
): number | null {
  if (!isPackageRedemptionLineName(line.nameSnapshot)) return null;
  const serviceId = line.serviceId?.trim();
  if (!serviceId) return null;
  const paise = serviceSellingPricePaiseById[serviceId];
  if (paise == null || paise < 0) return null;
  return Math.floor(paise);
}
