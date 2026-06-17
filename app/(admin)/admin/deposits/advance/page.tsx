import Link from 'next/link';
import { AdvanceDepositPanel } from '@/src/components/admin/deposits/AdvanceDepositPanel';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';

export const dynamic = 'force-dynamic';

export default function AdvanceDepositPage() {
  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.deposits.label, href: moduleHref('deposits') },
          { label: 'Advance deposit' },
        ]}
      />
      <PageHeader
        title="Advance deposit"
        description="Record offline or advance deposit payments. Does not assign beds or create invoices."
        actions={
          <Link
            href={moduleHref('deposits')}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-apg-silver hover:text-white"
          >
            All deposits →
          </Link>
        }
      />
      <AdvanceDepositPanel />
    </>
  );
}
