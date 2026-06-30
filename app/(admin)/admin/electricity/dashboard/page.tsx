import Link from 'next/link';
import { ElectricityRoomDashboardView } from '@/src/components/admin/electricity/ElectricityRoomDashboardView';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OverviewMonthPicker } from '@/src/components/admin/OverviewMonthPicker';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import {
  loadElectricityDashboardPgs,
  loadElectricityRoomDashboard,
} from '@/src/services/electricityRoomDashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export default async function ElectricityDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; pgId?: string }>;
}) {
  await requireAdminPermission('electricity:write');
  const sp = await searchParams;
  const billingMonth = resolveBillingMonth(sp.month);
  const pgId = sp.pgId ?? null;

  const [dashboard, pgs] = await Promise.all([
    loadElectricityRoomDashboard({ billingMonth, pgId }),
    loadElectricityDashboardPgs(),
  ]);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing', href: '/admin/billing?tab=electricity' },
          { label: 'Electricity dashboard' },
        ]}
      />
      <PageHeader
        title="Electricity dashboard"
        description="Every room in one place — bill, collected, outstanding, residents, and issues. No need to open five pages."
        actions={<OverviewMonthPicker billingMonth={billingMonth} />}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <PgFilterLink active={!pgId} href={`/admin/electricity/dashboard?month=${billingMonth}`}>
          All PGs
        </PgFilterLink>
        {pgs.map((pg) => (
          <PgFilterLink
            key={pg.id}
            active={pgId === pg.id}
            href={`/admin/electricity/dashboard?month=${billingMonth}&pgId=${pg.id}`}
          >
            {pg.name}
          </PgFilterLink>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Link
          href="/admin/billing/electricity/generate"
          className="font-medium text-[#FF5A1F] hover:underline"
        >
          Generate new bill →
        </Link>
        <Link href="/admin/billing?tab=approvals" className="text-apg-silver hover:text-white">
          Payment approvals →
        </Link>
        <Link href="/admin/electricity/duplicates" className="text-apg-silver hover:text-white">
          Fix duplicates →
        </Link>
      </div>

      <ElectricityRoomDashboardView data={dashboard} billingMonth={billingMonth} />
    </>
  );
}

function PgFilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        'rounded-full px-3 py-1 text-xs font-medium ' +
        (active
          ? 'bg-white/10 text-white ring-1 ring-white/20'
          : 'text-apg-silver hover:bg-white/5 hover:text-white')
      }
    >
      {children}
    </Link>
  );
}
