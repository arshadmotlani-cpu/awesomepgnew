import { SalonSettingsForm } from '@/src/hair/components/settings/SalonSettingsForm';
import { ResourcesPanel } from '@/src/hair/components/settings/ResourcesPanel';
import { listResourcesAdmin } from '@/src/hair/services/resources';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function SalonSettingsPage() {
  const ctx = await getTenantContextForPage();
  const [settings, resources] = await Promise.all([getSalonSettings(ctx), listResourcesAdmin()]);

  return (
    <div className="space-y-10">
      <SalonSettingsForm
        values={{
          businessName: settings.businessName,
          businessAddress: settings.businessAddress ?? '',
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
