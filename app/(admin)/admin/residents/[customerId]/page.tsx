import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminKycStatusWithWhatsApp } from '@/src/components/admin/AdminKycWhatsAppButton';
import { ArchiveResidentButton } from '@/src/components/admin/ArchiveResidentButton';
import { AssignTenantForm } from '@/src/components/admin/AssignTenantForm';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { BedAssignmentWhatsAppButton } from '@/src/components/admin/BedAssignmentWhatsAppButton';
import { EditTenantTenancyForm } from '@/src/components/admin/EditTenantTenancyForm';
import { RentUpdatedSuccessBanner } from '@/src/components/admin/RentUpdatedSuccessBanner';
import { FinancialCommandCenter } from '@/src/components/admin/FinancialCommandCenter';
import { CreateCustomChargeForm } from '@/src/components/admin/CreateCustomChargeForm';
import { ResidentActionBar } from '@/src/components/admin/ResidentActionBar';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listAdminRentInvoices } from '@/src/db/queries/admin';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref, moduleKycVerifyHref } from '@/src/lib/admin/navigation';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { getResidentDetail, getCustomerVerificationStatus } from '@/src/services/residentAdmin';
import {
  defaultTenantStartDate,
  listAssignableBeds,
} from '@/src/services/tenantAssignment';
import { loadBedPrice, computeMonthlyDepositPaise } from '@/src/services/pricing';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { listResidentInvoiceHistory } from '@/src/services/invoiceGeneration';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27] p-4';

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
  }>;
}) {
  const { customerId } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(customerId)) notFound();

  const session = await requireAdminPermission('bookings:write');
  const [detail, verification] = await Promise.all([
    getResidentDetail(session, customerId),
    getCustomerVerificationStatus(customerId),
  ]);
  if (!detail) notFound();

  const { customer, activeTenancy, canArchive } = detail;

  const assignableRows = await listAssignableBeds(session);
  const bedsForAssign = assignableRows.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}${b.manualOccupied ? ' · marked occupied' : ''}`,
    monthlyRatePaise: b.monthlyRatePaise,
    depositPaise: b.depositPaise,
  }));

  const bedOptions = assignableRows.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}${b.manualOccupied ? ' · marked occupied' : ''}`,
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

  const latestKyc = await getLatestKycSubmission(customerId);
  const pendingKycSubmissionId =
    latestKyc?.status === 'pending' ? latestKyc.id : null;

  const financialSummary = await getResidentFinancialSummary(customerId);
  const invoiceHistory = financialSummary
    ? await listResidentInvoiceHistory(customerId, 20)
    : [];

  const firstOpenRent = financialSummary?.rent.items.find((l) => l.outstandingPaise > 0);
  const firstOpenElec = financialSummary?.electricity.items.find((l) => l.outstandingPaise > 0);

  let websiteDepositPaise = 0;
  if (activeTenancy) {
    const bedRate = await loadBedPrice(activeTenancy.bedId, activeTenancy.moveInDate);
    if (bedRate) {
      websiteDepositPaise = computeMonthlyDepositPaise(bedRate);
    }
  }

  const rentRes = await listAdminRentInvoices();
  const rentHistory = rentRes.ok
    ? rentRes.data
        .filter((r) => r.customerPhone === customer.phone)
        .slice(0, 12)
    : [];

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
        description="Bed assignment, rent, deposit, KYC, and payment history."
        actions={
          activeTenancy ? (
            <Link
              href={`/admin/pgs/${activeTenancy.pgId}/map`}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-apg-silver hover:text-white"
            >
              PG bed map
            </Link>
          ) : null
        }
      />

      {verification && !verification.isVerified ? (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Not verified yet</p>
          <p className="mt-1">
            This person is in <strong>Website signups</strong> until you approve their{' '}
            <Link href="/admin/residents/kyc" className="font-semibold text-[#FF5A1F] hover:underline">
              KYC
            </Link>{' '}
            or a{' '}
            <Link href="/admin/collections" className="font-semibold text-[#FF5A1F] hover:underline">
              payment
            </Link>
            . Bed assignment is blocked until then.
            {activeTenancy ? (
              <>
                {' '}
                They currently occupy{' '}
                <strong>
                  Room {activeTenancy.roomNumber} · {activeTenancy.bedCode}
                </strong>{' '}
                — remove or reassign from the bed map if this was accidental.
              </>
            ) : null}
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
          Assignment and rent saved — all modules synced.
        </div>
      ) : null}

      {sp.assigned === '1' && activeTenancy ? (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <p className="font-semibold">Tenant assigned successfully</p>
          <p className="mt-1">
            Bed, rent, and deposit are saved. Monthly rent invoices will generate from move-in.
          </p>
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

      {financialSummary && activeTenancy ? (
        <>
          <FinancialCommandCenter summary={financialSummary} invoiceHistory={invoiceHistory} />
          <div className="mb-8">
            <CreateCustomChargeForm
              customerId={customerId}
              bookingId={activeTenancy.bookingId}
            />
          </div>
        </>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={SURFACE}>
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Status</p>
          <p className="mt-1">
            {activeTenancy ? (
              <Badge tone="emerald">
                Room {activeTenancy.roomNumber} · {activeTenancy.bedCode}
              </Badge>
            ) : (
              <Badge tone="amber">No bed assigned</Badge>
            )}
          </p>
          {activeTenancy ? (
            <p className="mt-2 text-xs text-apg-silver">{activeTenancy.pgName}</p>
          ) : null}
        </div>
        <div className={SURFACE}>
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Contact</p>
          <p className="mt-1 text-sm text-white">{customer.phone}</p>
          <p className="text-sm text-apg-silver">{customer.email}</p>
        </div>
        <div className={SURFACE}>
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">KYC</p>
          <p className="mt-1">
            <AdminKycStatusWithWhatsApp
              kycStatus={customer.kycStatus}
              phone={customer.phone}
              customerName={customer.fullName}
              badge={
                <Badge tone={toneForStatus(customer.kycStatus)}>
                  {titleCase(customer.kycStatus)}
                </Badge>
              }
            />
          </p>
          {pendingKycSubmissionId ? (
            <Link
              href={moduleKycVerifyHref(pendingKycSubmissionId)}
              className="mt-3 inline-flex rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              Verify KYC →
            </Link>
          ) : null}
        </div>
        <div className={SURFACE}>
          <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Deposit</p>
          {activeTenancy && depositSummary ? (
            <>
              <p className="mt-1 text-sm text-white">
                {paiseToInr(depositSummary.collectedPaise)} collected
              </p>
              <p className="text-xs text-apg-silver">
                Balance {paiseToInr(depositSummary.refundableBalancePaise)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-apg-silver">—</p>
          )}
        </div>
      </div>

      {activeTenancy ? (
        <div className="mb-8">
          <ResidentActionBar
            customerId={customerId}
            customerName={customer.fullName}
            phone={customer.phone}
            kycStatus={customer.kycStatus}
            pgId={activeTenancy.pgId}
            pgName={activeTenancy.pgName}
            roomNumber={activeTenancy.roomNumber}
            bookingId={activeTenancy.bookingId}
            monthlyRentPaise={activeTenancy.monthlyRentPaise}
            pendingRentPaise={firstOpenRent?.outstandingPaise ?? financialSummary?.rent.outstandingPaise}
            rentDueDate={firstOpenRent?.dueDate ?? undefined}
            rentOverdue={firstOpenRent?.status === 'overdue'}
            depositDuePaise={financialSummary?.deposit.outstandingPaise}
            depositCollectionStatus={financialSummary?.deposit.outstandingPaise ? 'partial' : undefined}
            depositRefundablePaise={financialSummary?.deposit.refundablePaise}
            pendingElectricityPaise={firstOpenElec?.outstandingPaise}
            electricityBasePaise={firstOpenElec?.requiredPaise}
            electricityDueDate={firstOpenElec?.dueDate ?? undefined}
            electricityOverdue={firstOpenElec?.status === 'overdue'}
            electricityInvoiceNumber={firstOpenElec?.invoiceNumber ?? undefined}
          />
        </div>
      ) : null}

      <div className="space-y-8">
        {activeTenancy ? (
          <>
            <section className={`${SURFACE} text-sm text-apg-silver`}>
              <p>
                <strong className="text-white">{activeTenancy.pgName}</strong> · Booking{' '}
                <Link
                  href={`/admin/bookings/${activeTenancy.bookingId}`}
                  className="font-semibold text-[#FF5A1F] hover:underline"
                >
                  {activeTenancy.bookingCode}
                </Link>
              </p>
              <p className="mt-1">
                Move-in {activeTenancy.moveInDate} · Rent{' '}
                {paiseToInr(activeTenancy.monthlyRentPaise)}/mo · Joined{' '}
                {formatDateTime(customer.createdAt)}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={`/admin/bookings/${activeTenancy.bookingId}`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  Rent & electricity
                </Link>
                <Link
                  href={`/admin/deposits/${activeTenancy.bookingId}`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  Deposit ledger
                </Link>
                <Link
                  href={`/admin/pgs/${activeTenancy.pgId}/map`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  Bed map
                </Link>
              </div>
            </section>

            <section id="edit-tenancy">
            <EditTenantTenancyForm
              bookingId={activeTenancy.bookingId}
              customerId={customerId}
              customerName={customer.fullName}
              customerPhone={customer.phone}
              currentBedId={activeTenancy.bedId}
              currentRoomLabel={`${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}`}
              currentMonthlyRentPaise={activeTenancy.monthlyRentPaise}
              currentDepositPaise={activeTenancy.depositPaise}
              ledgerCollectedPaise={depositSummary?.collectedPaise ?? 0}
              websiteDepositPaise={websiteDepositPaise}
              blocksWholeRoom={activeTenancy.blocksRoomAvailability}
              beds={bedOptions}
            />
            </section>
          </>
        ) : verification?.isVerified ? (
          <section id="assign-bed" className="scroll-mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-apg-orange">
              Assign to bed
            </h2>
            <p className="mb-4 max-w-xl text-sm text-apg-silver">
              Select PG, room, and bed below. Tenancy and occupancy update immediately.
            </p>
            <AssignTenantForm
              beds={bedsForAssign}
              defaultStartDate={defaultTenantStartDate()}
              prefill={{
                customerId: customer.id,
                fullName: customer.fullName,
                email: customer.email,
                phone: customer.phone,
                gender: customer.gender,
              }}
              theme="dark"
            />
          </section>
        ) : (
          <section id="assign-bed" className={`${SURFACE} scroll-mt-6`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
              Assign to bed
            </h2>
            <p className="mt-2 text-sm text-apg-silver">
              Approve KYC or a payment first — then this person moves to verified Residents and
              bed assignment unlocks.
            </p>
          </section>
        )}

        {rentHistory.length > 0 ? (
          <section className={SURFACE}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-apg-orange">
              Payment history
            </h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase text-apg-silver">
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">Month</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Due</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rentHistory.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2 pr-4 text-white">{inv.invoiceNumber}</td>
                      <td className="py-2 pr-4 text-apg-silver">{inv.billingMonth}</td>
                      <td className="py-2 pr-4 text-white">{paiseToInr(inv.rentPaise)}</td>
                      <td className="py-2 pr-4 text-apg-silver">{formatDate(inv.dueDate)}</td>
                      <td className="py-2">
                        <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>

      {canArchive ? (
        <div className="mt-10 border-t border-white/10 pt-8">
          <p className="mb-3 text-sm text-apg-silver">
            Remove signup-only accounts from the residents list. Does not delete their login.
          </p>
          <ArchiveResidentButton customerId={customer.id} customerName={customer.fullName} />
        </div>
      ) : null}
    </>
  );
}
