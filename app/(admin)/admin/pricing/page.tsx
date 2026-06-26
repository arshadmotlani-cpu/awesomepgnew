import Link from 'next/link';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { PricingCenter } from '@/src/components/admin/PricingCenter';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { loadPricingCommandCenterData } from '@/src/services/pricingCommandCenterLoader';

export const dynamic = 'force-dynamic';

export default async function PricingCommandCenterPage() {
  const session = await requireAdminPermission('pgs:write');
  const data = await loadPricingCommandCenterData(session);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Settings', href: '/admin/settings' },
          { label: 'Pricing Command Center' },
        ]}
      />
      <PageHeader
        title="Pricing Command Center"
        description="Single orchestrator for bed pricing — confirmed bookings keep pricingSnapshot."
        actions={
          <Link href="/admin/system/pricing-health" className="text-xs font-medium text-[#FF5A1F] hover:underline">
            Pricing health →
          </Link>
        }
      />
      <PricingCenter pgs={data.pgs} initialPgId={data.initialPgId} rooms={data.rooms} />
    </>
  );
}
