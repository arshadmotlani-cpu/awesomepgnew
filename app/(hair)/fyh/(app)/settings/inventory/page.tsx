import { InventorySettingsForm } from '@/src/hair/components/settings/InventorySettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function InventorySettingsPage() {
  const settings = await getSalonSettings();

  return <InventorySettingsForm values={settings.inventorySettings} />;
}
