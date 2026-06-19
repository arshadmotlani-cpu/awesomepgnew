import {
  DEFAULT_ELECTRICITY_DAILY_QR_PATH,
  DEFAULT_ELECTRICITY_DAILY_UPI_ID,
  DEFAULT_RENT_DEPOSIT_QR_PATH,
  DEFAULT_RENT_DEPOSIT_UPI_ID,
} from '@/src/lib/payments/defaultQr';

type QrCategory = { qrCodeImageUrl: string; upiId: string | null } | null | undefined;

/**
 * Booking checkout QR routing:
 * - Fixed / daily / reserve stays → electricity & daily QR
 * - Open-ended (continue living) / monthly → rent & deposit QR
 */
export function usesElectricityCheckoutQr(args: {
  durationMode: string;
  hasPs4Addon?: boolean;
}): boolean {
  if (args.hasPs4Addon) return true;
  if (args.durationMode === 'reserve') return true;
  if (args.durationMode === 'fixed_stay') return true;
  if (args.durationMode === 'daily') return true;
  return false;
}

export function resolveBookingCheckoutQr(args: {
  durationMode: string;
  hasPs4Addon?: boolean;
  rentCategory?: QrCategory;
  electricityCategory?: QrCategory;
}): { qrImageUrl: string; upiId: string } {
  const useElectricity = usesElectricityCheckoutQr(args);
  if (useElectricity) {
    return {
      qrImageUrl: args.electricityCategory?.qrCodeImageUrl ?? DEFAULT_ELECTRICITY_DAILY_QR_PATH,
      upiId: args.electricityCategory?.upiId ?? DEFAULT_ELECTRICITY_DAILY_UPI_ID,
    };
  }
  return {
    qrImageUrl: args.rentCategory?.qrCodeImageUrl ?? DEFAULT_RENT_DEPOSIT_QR_PATH,
    upiId: args.rentCategory?.upiId ?? DEFAULT_RENT_DEPOSIT_UPI_ID,
  };
}
