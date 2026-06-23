import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { BillingWorkflowGuide } from '@/src/components/admin/billing/BillingWorkflowGuide';
import { BillingAdvancedTools } from '@/src/components/admin/billing/BillingAdvancedTools';
import { BillingRecentCollections } from '@/src/components/admin/billing/BillingRecentCollections';
import { CollectionsActionQueue } from '@/src/components/admin/billing/CollectionsActionQueue';
import { CollectionsCommandCenter } from '@/src/components/admin/billing/CollectionsCommandCenter';
import { ElectricityRoomsPendingPanel } from '@/src/components/admin/ElectricityRoomsPendingPanel';
import { ElectricityBulkSendPanel } from '@/src/components/admin/ElectricityBulkSendPanel';
import { RentInvoicesBulkSendBar } from '@/src/components/admin/RentInvoicesBulkSendBar';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { FinancialRowActions } from '@/src/components/admin/FinancialRowActions';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  listAdminElectricityInvoicesForReminders,
  listAdminRentInvoices,
  listPgs,
} from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { adminHasPermission } from '@/src/lib/auth/roles';
import { ADMIN_MODULES, moduleHref, modulePgHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { isRentBillingOverviewActionable } from '@/src/lib/billing/rentBillingOverview';
import {
  buildCollectionsCommandStats,
  buildCollectionsQueue,
} from '@/src/lib/billing/collectionsQueue';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { listRentBillingOverview, listBillingCycleOperations } from '@/src/services/rentInvoices';
import { listRoomsMissingElectricityBill } from '@/src/services/electricityBilling';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';

const TABS = [
  { id: 'billing', label: 'Need attention' },
  { id: 'rent', label: 'Rent bills' },
  { id: 'electricity', label: 'Electricity bills' },
  { id: 'paid', label: 'Recent payments' },
] as const;

function mergeUnpaidRent(
  pending: AdminRentInvoiceRow[],
  overdue: AdminRentInvoiceRow[],
): AdminRentInvoiceRow[] {
  const byId = new Map<string, AdminRentInvoiceRow>();
  for (const row of [...pending, ...overdue]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

function sortRecentCollections(rows: AdminRentInvoiceRow[]): AdminRentInvoiceRow[] {
  return [...rows].sort((a, b) => {
    const aTime = a.paidAt?.getTime() ?? 0;
    const bTime = b.paidAt?.getTime() ?? 0;
    return bTime - aTime;
  });
}

function collectionsTabHref(tab: string, billingMonth: string) {
  const params = new URLSearchParams({ tab });
  params.set('month', billingMonth);
  return `/admin/revenue/billing?${params.toString()}`;
}

function isLastDayOfMonth(date: Date): boolean {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return date.getUTCDate() === lastDay;
}

export default async function CollectionsModulePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const sp = await searchParams;
  if (sp.tab === 'approvals') {
    redirect('/admin/operations/payment-reviews');
  }
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : 'billing';
  const billingMonth = resolveBillingMonth(sp.month);

  const session = await requireAdminSession('/admin/revenue/billing');
  await ensureAdminPageNotificationsSeen('/admin/revenue/billing', '/admin/revenue/billing');
  const canGenerateRent = adminHasPermission(session.role, 'rent:write');
  const canSendLinks = adminHasPermission(session.role, 'payments:write');
  const [rentPending, rentOverdue, rentPaid, elecPending, pgs, billingOverview, billingCycleOps, roomsMissingElectricity] =
    await Promise.all([
    listAdminRentInvoices({ status: 'pending' }),
    listAdminRentInvoices({ status: 'overdue' }),
    listAdminRentInvoices({ status: 'paid' }),
    listAdminElectricityInvoicesForReminders(),
    listPgs(),
    listRentBillingOverview(billingMonth),
    listBillingCycleOperations(),
    listRoomsMissingElectricityBill(billingMonth),
  ]);

  const allUnpaidRent = mergeUnpaidRent(
    rentPending.ok ? rentPending.data : [],
    rentOverdue.ok ? rentOverdue.data : [],
  );
  const allUnpaidElectricity = elecPending.ok ? elecPending.data : [];

  const collectionsQueue = buildCollectionsQueue({
    rentRows: allUnpaidRent,
    electricityRows: allUnpaidElectricity,
  });

  const collectionsStats = buildCollectionsCommandStats({
    queue: collectionsQueue,
    allUnpaidRent,
    allUnpaidElectricity,
    paidTodayRows: rentPaid.ok ? rentPaid.data : [],
  });

  const recentCollections = sortRecentCollections(rentPaid.ok ? rentPaid.data : []);

  const pgNameById = new Map(pgs.ok ? pgs.data.map((p) => [p.id, p.name]) : []);

  const needsBillCount = billingOverview.filter(
    (r) => isRentBillingOverviewActionable(r) && r.isDueForGeneration,
  ).length;

  const today = new Date();
  const currentMonth = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const isMonthEnd =
    billingMonth.slice(0, 7) === currentMonth.slice(0, 7) && isLastDayOfMonth(today);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.revenue.label, href: moduleHref('revenue') },
          { label: 'Billing' },
        ]}
      />
      <PageHeader
        title="Billing"
        description="Who owes money, how overdue, and who to contact next — sorted for collections."
      />
      <p className="mb-6 text-sm text-apg-silver">
        <Link href="/admin/invoices" className="font-semibold text-[#FF5A1F] hover:underline">
          All invoices
        </Link>
        {' — '}
        full list of bills. Paid and cancelled bills are excluded from amount due totals.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={collectionsTabHref(t.id, billingMonth)}
            className={
              'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
              (tab === t.id
                ? 'bg-[#FF5A1F] text-white'
                : 'border border-white/10 text-apg-silver hover:text-white')
            }
          >
            {t.label}
          </Link>
        ))}
      </div>

      <BillingWorkflowGuide
        billingMonth={billingMonth}
        tab={tab}
        needsBillCount={needsBillCount}
        unpaidRentCount={allUnpaidRent.length}
        unpaidElectricityCount={allUnpaidElectricity.length}
        roomsMissingElectricity={roomsMissingElectricity.length}
        isMonthEnd={isMonthEnd}
      />

      {tab === 'billing' ? (
        <>
          <CollectionsCommandCenter stats={collectionsStats} />
          <CollectionsActionQueue items={collectionsQueue} />
          <BillingRecentCollections
            rows={recentCollections}
            error={rentPaid.ok ? null : rentPaid.error ?? null}
          />
          <BillingAdvancedTools
            billingMonth={billingMonth}
            canGenerateRent={canGenerateRent}
            canSendLinks={canSendLinks}
            billingOverview={billingOverview}
            billingCycleOps={billingCycleOps}
            needsBillCount={needsBillCount}
          />
        </>
      ) : null}

      {tab === 'rent' ? (
        <>
          <header className="mb-4">
            <h2 className="text-base font-semibold text-white">Rent bills</h2>
            <p className="mt-1 text-sm text-apg-silver">
              Unpaid rent bills — send payment links or open a resident profile.
            </p>
          </header>
          <RentInvoicesBulkSendBar
            canSendLinks={canSendLinks}
            rows={
              rentPending.ok
                ? rentPending.data.map((r) => ({
                    id: r.id,
                    customerId: r.customerId,
                    customerFullName: r.customerFullName,
                    customerPhone: r.customerPhone,
                    pgId: r.pgId,
                    pgName: r.pgName,
                    roomNumber: r.roomNumber,
                    rentPaise: r.outstandingPaise,
                    dueDate: r.dueDate,
                    isOverdue: r.effectiveStatus === 'overdue',
                  }))
                : []
            }
          />
          <InvoiceTable
            title="Unpaid rent bills"
            error={rentPending.ok ? null : rentPending.error}
            rows={rentPending.ok ? rentPending.data : []}
            pgNameById={pgNameById}
          />
        </>
      ) : null}

      {tab === 'electricity' ? (
        <>
          <header className="mb-4">
            <h2 className="text-base font-semibold text-white">Electricity bills</h2>
            <p className="mt-1 text-sm text-apg-silver">
              Room meter bills split among residents — create bills from meter readings, then send
              payment links from here.
            </p>
          </header>
          <ElectricityRoomsPendingPanel
            rooms={roomsMissingElectricity}
            billingMonth={billingMonth}
          />
          <ElectricityBulkSendPanel
            rows={
              elecPending.ok
                ? elecPending.data.map((r) => ({
                    id: r.id,
                    customerId: r.customerId,
                    customerFullName: r.customerFullName,
                    customerPhone: r.customerPhone,
                    pgId: r.pgId,
                    pgName: r.pgName,
                    roomNumber: r.roomNumber,
                    amountPaise: r.outstandingPaise,
                    dueDate: r.dueDate,
                    isOverdue: r.isOverdue,
                  }))
                : []
            }
            canSendLinks={canSendLinks}
            billingMonth={billingMonth}
          />
          <InvoiceTable
            title="Unpaid electricity bills"
            error={elecPending.ok ? null : elecPending.error}
            rows={elecPending.ok ? elecPending.data : []}
            pgNameById={pgNameById}
            electricity
          />
        </>
      ) : null}

      {tab === 'paid' ? (
        <>
          <header className="mb-4">
            <h2 className="text-base font-semibold text-white">Recent payments</h2>
            <p className="mt-1 text-sm text-apg-silver">Rent bills marked as paid.</p>
          </header>
          <InvoiceTable
            title="Paid rent bills"
            error={rentPaid.ok ? null : rentPaid.error}
            rows={rentPaid.ok ? rentPaid.data.slice(0, 50) : []}
            pgNameById={pgNameById}
          />
        </>
      ) : null}
    </>
  );
}

function InvoiceTable({
  title,
  error,
  rows,
  pgNameById,
  electricity,
}: {
  title: string;
  error: string | null;
  rows: Array<{
    id: string;
    customerId?: string;
    customerFullName: string;
    customerPhone: string;
    pgName: string;
    pgId?: string;
    roomNumber: string;
    amountPaise?: number;
    rentPaise?: number;
    outstandingPaise?: number;
    status?: string;
    effectiveStatus?: string;
    dueDate: string;
    bookingId?: string;
    isOverdue?: boolean;
  }>;
  pgNameById: Map<string, string>;
  electricity?: boolean;
}) {
  if (error) return <DbStatusBanner error={error} />;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>PG · room</TH>
              <TH className="text-right">Amount due</TH>
              <TH>Due date</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const amount =
                r.outstandingPaise ??
                (electricity ? (r.amountPaise ?? 0) : (r.rentPaise ?? 0));
              const displayStatus = r.effectiveStatus ?? r.status;
              const pgId =
                r.pgId ?? [...pgNameById.entries()].find(([, n]) => n === r.pgName)?.[0] ?? '';
              const showActions =
                r.customerId &&
                pgId &&
                amount > 0 &&
                displayStatus !== 'paid' &&
                displayStatus !== 'cancelled';
              return (
                <TR key={r.id}>
                  <TD>
                    {r.customerId ? (
                      <Link
                        href={`/admin/residents/${r.customerId}`}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
                        {r.customerFullName}
                      </Link>
                    ) : pgId ? (
                      <Link
                        href={modulePgHref('collections', pgId)}
                        className="font-medium text-white hover:text-[#FF5A1F]"
                      >
                        {r.customerFullName}
                      </Link>
                    ) : (
                      r.customerFullName
                    )}
                    <p className="font-mono text-[11px] text-zinc-500">{r.customerPhone}</p>
                  </TD>
                  <TD className="text-xs text-apg-silver">
                    {r.pgName} · R{r.roomNumber}
                  </TD>
                  <TD className="text-right tabular-nums">{paiseToInr(amount)}</TD>
                  <TD className="text-xs">{formatDate(r.dueDate)}</TD>
                  <TD>
                    {displayStatus ? (
                      <Badge tone={toneForStatus(displayStatus)}>{titleCase(displayStatus)}</Badge>
                    ) : (
                      <Badge tone="amber">pending</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {showActions ? (
                      <FinancialRowActions
                        residentId={r.customerId!}
                        residentName={r.customerFullName}
                        phone={r.customerPhone}
                        pgId={pgId}
                        pgName={r.pgName}
                        amountPaise={amount}
                        purpose={electricity ? 'electricity' : 'rent'}
                        dueDate={r.dueDate}
                        roomNumber={r.roomNumber}
                        isOverdue={r.isOverdue ?? displayStatus === 'overdue'}
                        bookingId={r.bookingId}
                      />
                    ) : (
                      <span className="text-[10px] text-apg-silver">—</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </section>
  );
}
