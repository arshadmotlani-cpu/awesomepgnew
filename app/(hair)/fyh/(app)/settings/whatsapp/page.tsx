import { WhatsappSettingsForm } from '@/src/hair/components/settings/WhatsappSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function WhatsappSettingsPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);

  return <WhatsappSettingsForm values={settings.whatsappSettings} />;
}
