import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { ElectricityDuplicateRepairPanel } from '@/src/components/admin/electricity/ElectricityDuplicateRepairPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { listElectricityInvoiceDuplicateGroups } from '@/src/services/electricityInvoiceDuplicates';

export const dynamic = 'force-dynamic';

export default async function ElectricityDuplicatesPage() {
  await requireAdminPermission('electricity:write');
  const groups = await listElectricityInvoiceDuplicateGroups();

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          { label: 'Electricity duplicates' },
        ]}
      />
      <PageHeader
        title="Electricity invoice duplicates"
        description="Same resident, same room, same billing month — more than one active invoice. Select which invoice to keep; others are cancelled, not deleted."
      />
      <div className="mt-6">
        <ElectricityDuplicateRepairPanel groups={groups} />
      </div>
    </>
  );
}
