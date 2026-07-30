import { BillingSettingsForm } from '@/src/hair/components/settings/BillingSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function BillingSettingsPage() {
  const settings = await getSalonSettings();

  return <BillingSettingsForm values={settings.billingSettings} />;
}
