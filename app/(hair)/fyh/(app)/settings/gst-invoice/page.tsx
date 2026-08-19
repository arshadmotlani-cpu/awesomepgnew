import { GstInvoiceSettingsForm } from '@/src/hair/components/settings/GstInvoiceSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function GstInvoiceSettingsPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);

  return (
    <GstInvoiceSettingsForm
      values={{
        gstin: settings.gstin ?? '',
        invoicePrefix: settings.invoicePrefix,
        defaultGstPercent: settings.defaultGstBps / 100,
        invoiceNotes: settings.invoiceNotes ?? '',
        businessEmail: settings.billingSettings.businessEmail ?? '',
      }}
    />
  );
}
