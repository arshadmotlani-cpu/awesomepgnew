import { CommunicationSettingsForm } from '@/src/hair/components/settings/CommunicationSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function CommunicationSettingsPage() {
  const settings = await getSalonSettings();

  return <CommunicationSettingsForm values={settings.communicationSettings} />;
}
