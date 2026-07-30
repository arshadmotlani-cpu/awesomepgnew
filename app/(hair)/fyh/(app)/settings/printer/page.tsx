import { PrinterSettingsForm } from '@/src/hair/components/settings/PrinterSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function PrinterSettingsPage() {
  const settings = await getSalonSettings();

  return <PrinterSettingsForm values={settings.printerSettings} />;
}
