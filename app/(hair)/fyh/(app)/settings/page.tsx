import { SettingsForm } from '@/src/hair/components/settings/SettingsForm';
import { ResourcesPanel } from '@/src/hair/components/settings/ResourcesPanel';
import { listResourcesAdmin } from '@/src/hair/services/resources';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function SettingsPage() {
  const [settings, resources] = await Promise.all([getSalonSettings(), listResourcesAdmin()]);
  return (
    <div className="space-y-10">
    <SettingsForm
      values={{
        businessName: settings.businessName,
        businessAddress: settings.businessAddress ?? '',
        gstin: settings.gstin ?? '',
        invoicePrefix: settings.invoicePrefix,
        defaultGstPercent: settings.defaultGstBps / 100,
        defaultBufferMinutes: settings.defaultBufferMinutes,
        timezone: settings.timezone || 'Asia/Kolkata',
        businessHours: settings.businessHours ?? [],
        googleReviewUrl: settings.googleReviewUrl ?? '',
      }}
    />
    <ResourcesPanel resources={resources} />
    </div>
  );
}
