import { GstInvoiceSettingsForm } from '@/src/hair/components/settings/GstInvoiceSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function GstInvoiceSettingsPage() {
  const settings = await getSalonSettings();

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
