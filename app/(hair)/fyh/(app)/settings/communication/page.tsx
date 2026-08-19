import { CommunicationSettingsForm } from '@/src/hair/components/settings/CommunicationSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function CommunicationSettingsPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);

  return <CommunicationSettingsForm values={settings.communicationSettings} />;
}
