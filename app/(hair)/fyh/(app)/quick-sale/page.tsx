import { QuickSaleShell } from '@/src/hair/components/quick-sale/QuickSaleShell';
import { loadAppointmentCheckoutPrefill } from '@/src/hair/domain/basket/appointmentBridge';
import { loadBillableCatalog } from '@/src/hair/domain/catalog/adapter';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function QuickSalePage({
  searchParams,
}: {
  searchParams: Promise<{ appointmentId?: string }>;
}) {
  const params = await searchParams;
  const [billableItems, settings, appointmentPrefill] = await Promise.all([
    loadBillableCatalog(),
    getSalonSettings(),
    params.appointmentId
      ? loadAppointmentCheckoutPrefill(params.appointmentId).catch((e) => ({
          error: e instanceof Error ? e.message : 'Could not load appointment',
        }))
      : Promise.resolve(null),
  ]);

  const prefill =
    appointmentPrefill && 'appointmentId' in appointmentPrefill ? appointmentPrefill : null;
  const appointmentError =
    appointmentPrefill && 'error' in appointmentPrefill ? appointmentPrefill.error : null;

  return (
    <QuickSaleShell
      billableItems={billableItems}
      googleReviewUrl={settings.googleReviewUrl}
      billingDefaults={settings.billingSettings}
      appointmentPrefill={prefill}
      appointmentError={appointmentError}
    />
  );
}
