import { WhatsappSettingsForm } from '@/src/hair/components/settings/WhatsappSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function WhatsappSettingsPage() {
  const settings = await getSalonSettings();

  return <WhatsappSettingsForm values={settings.whatsappSettings} />;
}
