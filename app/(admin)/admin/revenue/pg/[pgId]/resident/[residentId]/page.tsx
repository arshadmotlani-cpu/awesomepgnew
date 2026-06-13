import { notFound } from 'next/navigation';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ResidentEntityPanel } from '@/src/components/admin/modules/ResidentEntityPanel';
import {
  listAdminDepositSummaries,
  listAdminElectricityInvoicesForReminders,
  listAdminRentInvoices,
  listPgs,
} from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref, modulePgHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';

export const dynamic = 'force-dynamic';

export default async function RevenueResidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ pgId: string; residentId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { pgId, residentId } = await params;
  const phone = decodeURIComponent(residentId);
  const billingMonth = resolveBillingMonth((await searchParams).month);
  await requireAdminSession('/admin/revenue');

  const pgs = await listPgs();
  if (!pgs.ok) return <DbStatusBanner error={pgs.error} />;
  const pg = pgs.data.find((p) => p.id === pgId);
  if (!pg) notFound();

  const [rentRes, elecRes, depositRes] = await Promise.all([
    listAdminRentInvoices({ pgId }),
    listAdminElectricityInvoicesForReminders({ pgId }),
    listAdminDepositSummaries(),
  ]);

  const rentRows = rentRes.ok ? rentRes.data.filter((r) => r.customerPhone === phone) : [];
  const elecRows = elecRes.ok ? elecRes.data.filter((r) => r.customerPhone === phone) : [];
  const deposits =
    depositRes.ok
      ? depositRes.data
          .filter((d) => d.pgName === pg.name && d.customerPhone === phone)
          .map((d) => ({
            bookingId: d.bookingId,
            collectedPaise: d.collectedPaise,
            refundableBalancePaise: d.refundableBalancePaise,
          }))
      : [];

  const residentName = rentRows[0]?.customerFullName ?? elecRows[0]?.customerFullName ?? phone;
  if (rentRows.length === 0 && elecRows.length === 0 && deposits.length === 0) notFound();

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.revenue.label, href: moduleHref('revenue', billingMonth) },
          { label: pg.name, href: modulePgHref('revenue', pgId, billingMonth) },
          { label: residentName },
        ]}
      />
      <PageHeader
        title={residentName}
        description="Level 3 — billing detail and actions (drawer for queue items)."
      />

      <ResidentEntityPanel
        residentName={residentName}
        phone={phone}
        pgName={pg.name}
        rentInvoices={rentRows}
        electricityInvoices={elecRows}
        deposits={deposits}
        module="revenue"
        pgId={pgId}
      />
    </>
  );
}
