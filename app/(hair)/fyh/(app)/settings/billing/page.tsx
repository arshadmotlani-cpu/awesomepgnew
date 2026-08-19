import { BillingSettingsForm } from '@/src/hair/components/settings/BillingSettingsForm';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function BillingSettingsPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);

  return <BillingSettingsForm values={settings.billingSettings} />;
}
