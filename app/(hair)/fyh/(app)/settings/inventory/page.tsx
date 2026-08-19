import { InventorySettingsForm } from '@/src/hair/components/settings/InventorySettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function InventorySettingsPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);

  return <InventorySettingsForm values={settings.inventorySettings} />;
}
