import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArchiveResidentButton } from '@/src/components/admin/ArchiveResidentButton';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { EditTenantTenancyForm } from '@/src/components/admin/EditTenantTenancyForm';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getResidentDetail } from '@/src/services/residentAdmin';
import { listAssignableBeds } from '@/src/services/tenantAssignment';
import { loadBedPrice, securityDepositForMode } from '@/src/services/pricing';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ResidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ assigned?: string }>;
}) {
  const { customerId } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(customerId)) notFound();

  const session = await requireAdminPermission('bookings:write');
  const detail = await getResidentDetail(session, customerId);
  if (!detail) notFound();

  const { customer, activeTenancy, canArchive } = detail;

  const assignableRows = await listAssignableBeds(session);
  const bedOptions = assignableRows.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}`,
  }));

  if (activeTenancy) {
    const currentLabel = `${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}`;
    if (!bedOptions.some((b) => b.bedId === activeTenancy.bedId)) {
      bedOptions.unshift({
        bedId: activeTenancy.bedId,
        label: `${currentLabel} (current)`,
      });
    }
  }

  const depositSummary = activeTenancy
    ? await getDepositSummaryForBooking(activeTenancy.bookingId)
    : null;

  let websiteDepositPaise = 0;
  if (activeTenancy) {
    const bedRate = await loadBedPrice(activeTenancy.bedId, activeTenancy.moveInDate);
    if (bedRate) {
      websiteDepositPaise = securityDepositForMode(bedRate, 'open_ended');
    }
  }

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/residents" className="text-sm text-zinc-500 hover:text-[#FF5A1F]">
          ← Back to residents
        </Link>
      </div>

      <PageHeader
        title={customer.fullName}
        description="Manage bed assignment, rent, deposit, and monthly billing for this resident."
      />

      {sp.assigned === '1' ? (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold">Tenant assigned successfully</p>
          <p className="mt-1">
            Bed, rent, and deposit are saved. Monthly rent invoices will generate from their
            move-in date.
          </p>
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</p>
          <p className="mt-1">
            {activeTenancy ? (
              <Badge tone="emerald">
                Room {activeTenancy.roomNumber} · {activeTenancy.bedCode}
              </Badge>
            ) : (
              <Badge tone="amber">No bed assigned</Badge>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Contact</p>
          <p className="mt-1 text-sm text-zinc-900">{customer.phone}</p>
          <p className="text-sm text-zinc-600">{customer.email}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">KYC</p>
          <p className="mt-1">
            <Badge tone={toneForStatus(customer.kycStatus)}>{titleCase(customer.kycStatus)}</Badge>
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Joined</p>
          <p className="mt-1 text-sm text-zinc-900">{formatDateTime(customer.createdAt)}</p>
        </div>
      </div>

      {activeTenancy ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
            <p>
              <strong>{activeTenancy.pgName}</strong> · Booking{' '}
              <Link
                href={`/admin/bookings/${activeTenancy.bookingId}`}
                className="font-semibold text-[#FF5A1F] hover:underline"
              >
                {activeTenancy.bookingCode}
              </Link>
            </p>
            <p className="mt-1">
              Move-in {activeTenancy.moveInDate} · Rent {paiseToInr(activeTenancy.monthlyRentPaise)}/mo
              · Deposit on booking {paiseToInr(activeTenancy.depositPaise)}
              {depositSummary
                ? ` · Ledger balance ${paiseToInr(depositSummary.refundableBalancePaise)}`
                : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                href={`/admin/bookings/${activeTenancy.bookingId}`}
                className="text-sm font-semibold text-[#FF5A1F] hover:underline"
              >
                Open booking (rent & electricity)
              </Link>
              <Link
                href={`/admin/deposits/${activeTenancy.bookingId}`}
                className="text-sm font-semibold text-[#FF5A1F] hover:underline"
              >
                Deposit ledger
              </Link>
            </div>
          </div>

          <EditTenantTenancyForm
            bookingId={activeTenancy.bookingId}
            customerId={customerId}
            currentBedId={activeTenancy.bedId}
            currentRoomLabel={`${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}`}
            currentMonthlyRentPaise={activeTenancy.monthlyRentPaise}
            currentDepositPaise={activeTenancy.depositPaise}
            ledgerCollectedPaise={depositSummary?.collectedPaise ?? 0}
            websiteDepositPaise={websiteDepositPaise}
            blocksWholeRoom={activeTenancy.blocksRoomAvailability}
            beds={bedOptions}
          />
        </div>
      ) : (
        <div className="max-w-xl space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-semibold">Signed up but not assigned yet</p>
          <p>
            This person created an account but has not paid online or been assigned a bed. Assign
            them manually — set room, rent, and deposit — and monthly rent invoices will run
            automatically from their move-in date.
          </p>
          <Link
            href={`/admin/bookings/new?customerId=${customer.id}`}
            className="inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Assign to bed
          </Link>
        </div>
      )}

      {canArchive ? (
        <div className="mt-10 border-t border-zinc-200 pt-8">
          <p className="mb-3 text-sm text-zinc-600">
            Remove signup-only accounts or test users from the residents list. This does not delete
            their login — it hides them from admin until they book again.
          </p>
          <ArchiveResidentButton customerId={customer.id} customerName={customer.fullName} />
        </div>
      ) : null}
    </>
  );
}
