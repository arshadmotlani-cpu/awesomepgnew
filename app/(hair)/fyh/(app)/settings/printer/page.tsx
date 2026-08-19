import { PrinterSettingsForm } from '@/src/hair/components/settings/PrinterSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function PrinterSettingsPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);

  return <PrinterSettingsForm values={settings.printerSettings} />;
}
