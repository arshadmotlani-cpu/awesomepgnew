import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { BedAssignmentWhatsAppButton } from '@/src/components/admin/BedAssignmentWhatsAppButton';
import { EditMoveInDateForm } from '@/src/components/admin/EditMoveInDateForm';
import { EditRentDueDateForm } from '@/src/components/admin/EditRentDueDateForm';
import { ResidentFinancialScheduleCard } from '@/src/components/admin/residents/ResidentFinancialScheduleCard';
import { EditTenantTenancyForm } from '@/src/components/admin/EditTenantTenancyForm';
import { RentUpdatedSuccessBanner } from '@/src/components/admin/RentUpdatedSuccessBanner';
import { FinalSettlementPanel } from '@/src/components/admin/FinalSettlementPanel';
import { Resident360WorkflowBar } from '@/src/components/admin/residents/Resident360WorkflowBar';
import { ResidentInlineOpenBills } from '@/src/components/admin/residents/ResidentInlineOpenBills';
import { ResidentProfileAdvancedTools } from '@/src/components/admin/residents/ResidentProfileAdvancedTools';
import { buildResident360Workflow } from '@/src/lib/residents/resident360Workflow';
import {
  mapUnresolvedActionRow,
  pickPrimaryUnresolvedAction,
} from '@/src/lib/residents/residentUnresolvedActions';
import { syncActionItems } from '@/src/services/actionItems';
import { getOpenActionsForResident } from '@/src/services/unresolvedActions';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listAdminRentInvoices } from '@/src/db/queries/admin';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { isExpressCollectionNote } from '@/src/lib/billing/expressCollectionConstants';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { adminStayTypeLabel, isMonthlyStayType } from '@/src/lib/stayType';
import { diffDays, parseDate } from '@/src/lib/dates';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { getResidentDetail, getCustomerVerificationStatus } from '@/src/services/residentAdmin';
import { listAssignableBeds } from '@/src/services/tenantAssignment';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { listResidentInvoiceHistory } from '@/src/services/invoiceGeneration';
import { getResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27] p-4';

function residentContextLine(
  customer: { fullName: string; residencyStatus: string },
  activeTenancy: { pgName: string; roomNumber: string; bedCode: string } | null,
) {
  if (customer.residencyStatus === 'vacated') return `${customer.fullName} — moved out`;
  if (activeTenancy) {
    return `${customer.fullName} — living at ${activeTenancy.pgName}, Room ${activeTenancy.roomNumber}, Bed ${activeTenancy.bedCode}`;
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
  }>;
}) {
  const { customerId } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(customerId)) notFound();

  const session = await requireAdminPermission('bookings:write');
  await syncActionItems(session).catch(() => undefined);
  const [detail, verification, openUnresolvedRows] = await Promise.all([
    getResidentDetail(session, customerId),
    getCustomerVerificationStatus(customerId),
    getOpenActionsForResident(customerId),
  ]);
  if (!detail) notFound();

  const { customer, activeTenancy, canArchive, settledTenancy } = detail;

  const assignableRows = await listAssignableBeds(session);
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
    : settledTenancy
      ? await getDepositSummaryForBooking(settledTenancy.bookingId)
      : null;

  const latestKyc = await getLatestKycSubmission(customerId);
  const pendingKycSubmissionId =
    latestKyc?.status === 'pending' ? latestKyc.id : null;

  const financialSummary =
    customer.residencyStatus === 'vacated' ? null : await getResidentFinancialSummary(customerId);
  const invoiceHistory =
    financialSummary && customer.residencyStatus !== 'vacated'
      ? await listResidentInvoiceHistory(customerId, 20)
      : [];

  const billingDefaults = activeTenancy
    ? await getResidentBillingFormDefaults(customerId, activeTenancy.bookingId)
    : null;

  const primaryUnresolved = pickPrimaryUnresolvedAction(
    openUnresolvedRows.map(mapUnresolvedActionRow),
  );

  const resident360 = buildResident360Workflow({
    customerId,
    customerName: customer.fullName,
    kycStatus: customer.kycStatus,
    pendingKycSubmissionId,
    hasActiveTenancy: Boolean(activeTenancy),
    hasBed: Boolean(activeTenancy?.bedId),
    bookingId: activeTenancy?.bookingId ?? settledTenancy?.bookingId ?? null,
    financialSummary,
    residencyStatus: customer.residencyStatus,
    primaryUnresolved,
  });

  const rentRes = await listAdminRentInvoices();
  const rentHistory = rentRes.ok
    ? rentRes.data
        .filter(
          (r) =>
            r.customerPhone === customer.phone &&
            r.status !== 'cancelled' &&
            (!activeTenancy || r.bookingId === activeTenancy.bookingId),
        )
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
        description={residentContextLine(customer, activeTenancy)}
      />

      <Resident360WorkflowBar workflow={resident360} />

      {verification && !verification.isVerified ? (
        <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Not verified yet</p>
          <p className="mt-1">
            Approve their{' '}
            <Link href="/admin/residents/kyc" className="font-semibold text-[#FF5A1F] hover:underline">
              identity documents
            </Link>{' '}
            or confirm a{' '}
            <Link href="/admin/revenue/billing" className="font-semibold text-[#FF5A1F] hover:underline">
              payment
            </Link>{' '}
            before assigning a bed.
            {activeTenancy ? (
              <>
                {' '}
                They are currently on{' '}
                <strong>
                  Room {activeTenancy.roomNumber} · {activeTenancy.bedCode}
                </strong>{' '}
                — use the bed map to reassign if this was a mistake.
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
          Bed and rent saved. Billing modules are updated.
        </div>
      ) : null}

      {sp.assigned === '1' && activeTenancy ? (
        <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <p className="font-semibold">Bed assigned</p>
          <p className="mt-1">
            Rent and security deposit are set. Monthly rent bills will start from move-in date.
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

      {settledTenancy && customer.residencyStatus === 'vacated' ? (
        <FinalSettlementPanel
          customerName={customer.fullName}
          settledTenancy={settledTenancy}
          depositWallet={depositSummary}
        />
      ) : null}

      {customer.residencyStatus !== 'vacated' ? (
        <>
          {activeTenancy &&
          financialSummary &&
          billingDefaults &&
          isMonthlyStayType(activeTenancy.stayType) ? (
            <ResidentInlineOpenBills
              customerId={customerId}
              customerName={customer.fullName}
              phone={customer.phone}
              pgId={activeTenancy.pgId}
              pgName={activeTenancy.pgName}
              roomNumber={activeTenancy.roomNumber}
              bookingId={activeTenancy.bookingId}
              billingDefaults={billingDefaults}
              financialSummary={financialSummary}
            />
          ) : null}

          {activeTenancy && billingDefaults ? (
            <ResidentFinancialScheduleCard
              billingDefaults={billingDefaults}
              financialSummary={financialSummary}
              depositSummary={depositSummary}
              moveInDate={activeTenancy.moveInDate}
              stayType={activeTenancy.stayType}
              durationMode={activeTenancy.durationMode}
              expectedCheckoutDate={activeTenancy.expectedCheckoutDate}
            />
          ) : null}

          {financialSummary && activeTenancy ? (
            <ResidentProfileAdvancedTools
              customerId={customerId}
              customerName={customer.fullName}
              phone={customer.phone}
              kycStatus={customer.kycStatus}
              canArchive={canArchive}
              financialSummary={financialSummary}
              invoiceHistory={invoiceHistory}
              depositWallet={depositSummary}
              bookingId={activeTenancy.bookingId}
              billingDefaults={billingDefaults}
            />
          ) : canArchive ? (
            <ResidentProfileAdvancedTools
              customerId={customerId}
              customerName={customer.fullName}
              phone={customer.phone}
              kycStatus={customer.kycStatus}
              canArchive={canArchive}
              invoiceHistory={[]}
            />
          ) : null}
        </>
      ) : null}

      <div className="space-y-8">
        {activeTenancy ? (
          <>
            <section className={`${SURFACE} text-sm text-apg-silver`}>
              <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Stay details</p>
              <p className="mt-2">
                <strong className="text-white">{activeTenancy.pgName}</strong> · Booking{' '}
                <Link
                  href={`/admin/bookings/${activeTenancy.bookingId}`}
                  className="font-semibold text-[#FF5A1F] hover:underline"
                >
                  {activeTenancy.bookingCode}
                </Link>
              </p>
              <p className="mt-1">
                {isMonthlyStayType(activeTenancy.stayType) ? (
                  <>
                    Check-in {formatDate(activeTenancy.moveInDate)} · Rent{' '}
                    {paiseToInr(activeTenancy.monthlyRentPaise)}/mo · Joined{' '}
                    {formatDateTime(customer.createdAt)}
                  </>
                ) : (
                  <>
                    Check-in {formatDate(activeTenancy.moveInDate)}
                    {activeTenancy.expectedCheckoutDate
                      ? ` · Check-out ${formatDate(activeTenancy.expectedCheckoutDate)}`
                      : ''}
                    {activeTenancy.expectedCheckoutDate
                      ? ` · ${diffDays(
                          parseDate(activeTenancy.moveInDate),
                          parseDate(activeTenancy.expectedCheckoutDate),
                        )} nights`
                      : ''}{' '}
                    · Fixed-date stay · Joined {formatDateTime(customer.createdAt)}
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={`/admin/bookings/${activeTenancy.bookingId}`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  Rent & electricity bills
                </Link>
                <Link
                  href={`/admin/deposits/${activeTenancy.bookingId}`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  Security deposit
                </Link>
                <Link
                  href={`/admin/pgs/${activeTenancy.pgId}/map`}
                  className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                >
                  PG bed map
                </Link>
              </div>
            </section>

            <EditMoveInDateForm
              bookingId={activeTenancy.bookingId}
              customerId={customerId}
              currentMoveInDate={activeTenancy.moveInDate}
            />

            {billingDefaults && isMonthlyStayType(activeTenancy.stayType) ? (
              <EditRentDueDateForm
                bookingId={activeTenancy.bookingId}
                customerId={customerId}
                currentNextDueDate={billingDefaults.nextRentDueDate}
                billingDay={billingDefaults.billingDay}
              />
            ) : null}

            <section id="edit-tenancy">
            <EditTenantTenancyForm
              bookingId={activeTenancy.bookingId}
              customerId={customerId}
              customerName={customer.fullName}
              customerPhone={customer.phone}
              currentBedId={activeTenancy.bedId}
              currentRoomLabel={`${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}`}
              blocksWholeRoom={activeTenancy.blocksRoomAvailability}
              beds={bedOptions}
            />
            </section>
          </>
        ) : verification?.isVerified ? (
          <section id="assign-bed" className={`${SURFACE} scroll-mt-6`}>
            <h2 className="text-sm font-semibold text-white">Assign to a bed</h2>
            <p className="mt-2 max-w-xl text-sm text-apg-silver">
              Use the bed assignment command center to pick a PG, room, and bed. Rent and occupancy
              update as soon as you save.
            </p>
            <Link
              href={`/admin/beds?customerId=${customerId}`}
              className="mt-4 inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Open bed assignment →
            </Link>
          </section>
        ) : (
          <section id="assign-bed" className={`${SURFACE} scroll-mt-6`}>
            <h2 className="text-sm font-semibold text-white">Assign to a bed</h2>
            <p className="mt-2 text-sm text-apg-silver">
              Approve identity documents or confirm a payment first — then bed assignment unlocks.
            </p>
          </section>
        )}

        {rentHistory.length > 0 && customer.residencyStatus !== 'vacated' ? (
          <section className={SURFACE}>
            <h2 className="text-sm font-semibold text-white">Rent payment history</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase text-apg-silver">
                    <th className="py-2 pr-4">Invoice</th>
                    <th className="py-2 pr-4">Month</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Paid</th>
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rentHistory.map((inv) => {
                    const historical = isExpressCollectionNote(inv.notes);
                    return (
                    <tr key={inv.id}>
                      <td className="py-2 pr-4 text-white">{inv.invoiceNumber}</td>
                      <td className="py-2 pr-4 text-apg-silver">{inv.billingMonth}</td>
                      <td className="py-2 pr-4 text-white">{paiseToInr(inv.rentPaise)}</td>
                      <td className="py-2 pr-4 text-apg-silver">
                        {inv.paidAt ? formatDate(inv.paidAt) : '—'}
                      </td>
                      <td className="py-2 pr-4 text-apg-silver">
                        {inv.paymentProvider ? titleCase(inv.paymentProvider.replace('_', ' ')) : '—'}
                      </td>
                      <td className="py-2">
                        {historical ? (
                          <Badge tone="emerald">Paid (Historical)</Badge>
                        ) : (
                          <Badge tone={toneForStatus(inv.status)}>{titleCase(inv.status)}</Badge>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
