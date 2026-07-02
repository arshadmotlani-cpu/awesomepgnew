import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NotificationActionResolved } from '@/src/components/admin/NotificationActionResolved';
import { BedAssignmentWhatsAppButton } from '@/src/components/admin/BedAssignmentWhatsAppButton';
import { RentUpdatedSuccessBanner } from '@/src/components/admin/RentUpdatedSuccessBanner';
import { ResidentCommandCenter } from '@/src/components/admin/residents/command-center/ResidentCommandCenter';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { evaluateNotificationDeepLink } from '@/src/lib/admin/notificationDeepLinkGuard';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { syncActionItems } from '@/src/services/actionItems';
import { listAssignableBeds } from '@/src/services/tenantAssignment';
import { loadResidentCommandCenter } from '@/src/services/residentCommandCenter';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function residentContextLine(
  customer: { fullName: string; residencyStatus: string },
  activeTenancy: { pgName: string; roomNumber: string; bedCode: string } | null,
) {
  if (customer.residencyStatus === 'vacated') return `${customer.fullName} — moved out`;
  if (activeTenancy) {
    return `${customer.fullName} — ${activeTenancy.pgName}, Room ${activeTenancy.roomNumber}, Bed ${activeTenancy.bedCode}`;
  }
  return `${customer.fullName} — no bed assigned yet`;
}

export default async function ResidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{
    assigned?: string;
    rentUpdated?: string;
    rentFrom?: string;
    rentTo?: string;
    paymentLink?: string;
    linkError?: string;
    bedReassigned?: string;
    saved?: string;
    expressCollection?: string;
    read?: string;
  }>;
}) {
  const { customerId } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(customerId)) notFound();

  if (sp.read) {
    await ensureAdminPageNotificationsSeen(
      `/admin/residents/${customerId}`,
      `/admin/residents/${customerId}`,
      sp.read,
    );
    const deepLink = await evaluateNotificationDeepLink(sp.read);
    if (deepLink.status === 'resolved') {
      return <NotificationActionResolved message={deepLink.message} />;
    }
  }

  const session = await requireAdminPermission('bookings:write');
  await syncActionItems(session).catch(() => undefined);

  const data = await loadResidentCommandCenter(session, customerId);
  if (!data) notFound();

  const assignableRows = await listAssignableBeds(session);
  const bedOptions = assignableRows.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}${b.manualOccupied ? ' · marked occupied' : ''}`,
  }));

  if (data.activeTenancy) {
    const t = data.activeTenancy;
    const currentLabel = `${t.pgName} · Room ${t.roomNumber} · ${t.bedCode}`;
    if (!bedOptions.some((b) => b.bedId === t.bedId)) {
      bedOptions.unshift({ bedId: t.bedId, label: `${currentLabel} (current)` });
    }
  }

  const { customer, activeTenancy } = data;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.residents.label, href: moduleHref('residents') },
          { label: customer.fullName },
        ]}
      />

      <PageHeader
        title={customer.fullName}
        description={residentContextLine(customer, activeTenancy)}
      />

      {data.verification && !data.verification.isVerified ? (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Not verified yet</p>
          <p className="mt-1">
            Approve their{' '}
            <Link href="/admin/residents/kyc" className="font-semibold text-[#FF5A1F] hover:underline">
              identity documents
            </Link>{' '}
            or confirm a{' '}
            <Link href="/admin/billing" className="font-semibold text-[#FF5A1F] hover:underline">
              payment
            </Link>{' '}
            before assigning a bed.
          </p>
        </div>
      ) : null}

      {sp.rentUpdated === '1' && sp.rentTo && activeTenancy ? (
        <RentUpdatedSuccessBanner
          fromPaise={Number(sp.rentFrom ?? activeTenancy.monthlyRentPaise)}
          toPaise={Number(sp.rentTo)}
          paymentLinkUrl={sp.paymentLink}
          linkError={sp.linkError === '1'}
          customerName={customer.fullName}
          customerPhone={customer.phone}
          pgName={activeTenancy.pgName}
        />
      ) : null}

      {sp.bedReassigned === '1' && activeTenancy ? (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <p className="font-semibold">Bed reassignment saved</p>
          <div className="mt-3">
            <BedAssignmentWhatsAppButton
              customerName={customer.fullName}
              phone={customer.phone}
              pgName={activeTenancy.pgName}
              roomNumber={activeTenancy.roomNumber}
              bedCode={activeTenancy.bedCode}
            />
          </div>
        </div>
      ) : null}

      {sp.saved === '1' ? (
        <div className="mb-6 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Bed and rent saved. Billing modules are updated.
        </div>
      ) : null}

      {sp.assigned === '1' && activeTenancy ? (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <p className="font-semibold">Bed assigned</p>
          <p className="mt-1">Monthly rent bills will start from move-in date.</p>
          <div className="mt-3">
            <BedAssignmentWhatsAppButton
              customerName={customer.fullName}
              phone={customer.phone}
              pgName={activeTenancy.pgName}
              roomNumber={activeTenancy.roomNumber}
              bedCode={activeTenancy.bedCode}
            />
          </div>
        </div>
      ) : null}

      <ResidentCommandCenter data={data} bedOptions={bedOptions} />
    </>
  );
}
