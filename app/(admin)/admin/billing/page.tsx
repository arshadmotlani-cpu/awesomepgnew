import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { BillingWorkflowGuide } from '@/src/components/admin/billing/BillingWorkflowGuide';
import { BillingAdvancedTools } from '@/src/components/admin/billing/BillingAdvancedTools';
import { BillingCommandCentreHeader } from '@/src/components/admin/billing/BillingCommandCentreHeader';
import { BillingDiagnosticsPanel } from '@/src/components/admin/billing/BillingDiagnosticsPanel';
import { BillingRecentCollections } from '@/src/components/admin/billing/BillingRecentCollections';
import { CollectionsActionQueue } from '@/src/components/admin/billing/CollectionsActionQueue';
import { CollectionsCommandCenter } from '@/src/components/admin/billing/CollectionsCommandCenter';
import { ElectricityRoomsPendingPanel } from '@/src/components/admin/ElectricityRoomsPendingPanel';
import { ElectricityBulkSendPanel } from '@/src/components/admin/ElectricityBulkSendPanel';
import { ElectricityDuplicateWarningBanner } from '@/src/components/admin/electricity/ElectricityDuplicateWarningBanner';
import { RentInvoicesBulkSendBar } from '@/src/components/admin/RentInvoicesBulkSendBar';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { FinancialRowActions } from '@/src/components/admin/FinancialRowActions';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  listAdminElectricityInvoicesForReminders,
  listAdminOpenRentInvoices,
  listAdminPaidElectricityInvoices,
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
import {
  BillingFailuresPanel,
  BillingGeneratedTodayPanel,
  BillingHealthCardPanel,
} from '@/src/components/admin/billing/BillingCenterPanels';
import { BillingCentreCommandDashboard } from '@/src/components/admin/billing/BillingCentreCommandDashboard';
import { BillingCycleCertificationPanel } from '@/src/components/admin/billing/BillingCycleCertificationPanel';
import { PipelineTestIntegrityPanel } from '@/src/components/admin/billing/PipelineTestIntegrityPanel';
import { BillingProductionRepairPanel } from '@/src/components/admin/billing/BillingProductionRepairPanel';
import {
  canAdminMarkInvoicePaidWithCash,
  resolveFinancialInvoiceIdMap,
} from '@/src/services/adminCashSettlement';
import {
  listPipelineTestIntegrityIssues,
  listStrayZeroProductionInvoices,
} from '@/src/services/billingPipelineIntegrity';
import { loadBillingCommandCenterSnapshot } from '@/src/services/billingCommandCenter';
import { todayInBillingTimezone } from '@/src/lib/billing/billingTimezone';
import { parseBillingCentreFilters } from '@/src/lib/admin/billingCentreDashboardPresentation';
import { getBillingHealthSnapshot } from '@/src/services/billingHealth';
import {
  getLatestBillingGenerationRun,
  listBillingGenerationFailures,
  listTodayGeneratedInvoices,
} from '@/src/services/billingScheduler';
import {
  mergeBillingRecentCollections,
} from '@/src/lib/admin/billingCollectionsPresentation';
import { loadBillingCentreDashboardSnapshot } from '@/src/services/billingCentreDashboard';
import { listRentBillingOverview, listBillingCycleOperations, type BillingCycleOperationRow } from '@/src/services/rentInvoices';
import { listRoomsMissingElectricityBill } from '@/src/services/electricityBilling';
import type { AdminRentInvoiceRow } from '@/src/db/queries/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const EMPTY_BILLING_CYCLE_OPS: {
  dueSoon: BillingCycleOperationRow[];
  generatedPending: BillingCycleOperationRow[];
} = { dueSoon: [], generatedPending: [] };

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'generated', label: "Today's generated" },
  { id: 'failures', label: 'Failed jobs' },
  { id: 'billing', label: 'Need attention' },
  { id: 'rent', label: 'Rent bills' },
  { id: 'electricity', label: 'Electricity' },
  { id: 'paid', label: 'Recent payments' },
  { id: 'diagnostics', label: 'Diagnostics' },
] as const;

function mergeUnpaidRent(open: AdminRentInvoiceRow[]): AdminRentInvoiceRow[] {
  return open.filter(
    (r) => r.outstandingPaise > 0 && r.effectiveStatus !== 'paid' && r.effectiveStatus !== 'cancelled',
  );
}

function mergeRecentCollections(
  rentRows: AdminRentInvoiceRow[],
  electricityRows: import('@/src/db/queries/admin').AdminPaidElectricityCollectionRow[],
) {
  return mergeBillingRecentCollections(rentRows, electricityRows);
}

function collectionsTabHref(tab: string, billingMonth: string) {
  const params = new URLSearchParams({ tab });
  params.set('month', billingMonth);
  return `/admin/billing?${params.toString()}`;
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
  searchParams: Promise<{
    tab?: string;
    month?: string;
    pg?: string;
    room?: string;
    resident?: string;
    paidPeriod?: string;
  }>;
}) {
  const sp = await searchParams;
  if (sp.tab === 'approvals') {
    redirect('/admin/operations?filter=waiting_for_approval');
  }
  const tab = TABS.some((t) => t.id === sp.tab) ? sp.tab! : 'dashboard';
  const billingMonth = resolveBillingMonth(sp.month);
  const todayIst = todayInBillingTimezone();
  const dashboardFilters = parseBillingCentreFilters(sp);

  const session = await requireAdminSession('/admin/billing');
  await ensureAdminPageNotificationsSeen('/admin/billing', '/admin/billing');
  const canGenerateRent = adminHasPermission(session.role, 'rent:write');
  const canSendLinks = adminHasPermission(session.role, 'payments:write');

  const dashboardSnapshotPromise =
    tab === 'dashboard'
      ? loadBillingCentreDashboardSnapshot(session, billingMonth, dashboardFilters)
      : Promise.resolve(null);

  const needsPaidData = tab === 'billing' || tab === 'paid';
  const needsGeneratedTab = tab === 'generated';
  const needsFailuresTab = tab === 'failures';
  const needsDiagnosticsTab = tab === 'diagnostics';

  const [
    openRent,
    elecPending,
    pgs,
    billingOverview,
    roomsMissingElectricity,
    billingHealth,
    billingSnapshot,
    rentPaid,
    elecPaid,
    billingCycleOps,
    lastRun,
    generatedToday,
    failures,
    pipelineIssues,
    strayZeroInvoices,
    dashboardSnapshot,
  ] = await Promise.all([
    listAdminOpenRentInvoices(),
    listAdminElectricityInvoicesForReminders(),
    listPgs(),
    listRentBillingOverview(billingMonth),
    listRoomsMissingElectricityBill(billingMonth),
    getBillingHealthSnapshot(),
    loadBillingCommandCenterSnapshot(session, billingMonth, { reconcile: false }),
    needsPaidData
      ? listAdminRentInvoices({ status: 'paid' })
      : Promise.resolve({ ok: true as const, data: [] as AdminRentInvoiceRow[] }),
    needsPaidData
      ? listAdminPaidElectricityInvoices()
      : Promise.resolve({ ok: true as const, data: [] }),
    tab === 'billing' ? listBillingCycleOperations() : Promise.resolve(EMPTY_BILLING_CYCLE_OPS),
    needsGeneratedTab || needsFailuresTab ? getLatestBillingGenerationRun() : Promise.resolve(null),
    needsGeneratedTab ? listTodayGeneratedInvoices(todayIst) : Promise.resolve([]),
    needsFailuresTab
      ? listBillingGenerationFailures({ unresolvedOnly: true, limit: 50 })
      : Promise.resolve([]),
    needsDiagnosticsTab ? listPipelineTestIntegrityIssues() : Promise.resolve([]),
    needsDiagnosticsTab ? listStrayZeroProductionInvoices() : Promise.resolve([]),
    dashboardSnapshotPromise,
  ]);

  const allUnpaidRent = mergeUnpaidRent(openRent.ok ? openRent.data : []);
  const rentPendingRows = allUnpaidRent.filter((r) => r.effectiveStatus !== 'payment_in_progress');
  const allUnpaidElectricity = elecPending.ok ? elecPending.data : [];

  const collectionsQueue = buildCollectionsQueue({
    rentRows: allUnpaidRent,
    electricityRows: allUnpaidElectricity,
  });

  const financialIdMap = await resolveFinancialInvoiceIdMap(
    collectionsQueue.map((item) => ({
      sourceTable: item.sourceTable,
      sourceId: item.sourceId,
    })),
  );
  for (const item of collectionsQueue) {
    item.financialInvoiceId =
      financialIdMap.get(`${item.sourceTable}:${item.sourceId}`) ?? null;
  }

  const canMarkCash = canAdminMarkInvoicePaidWithCash(session.role);

  const collectionsStats = buildCollectionsCommandStats({
    queue: collectionsQueue,
    allUnpaidRent,
    allUnpaidElectricity,
    paidTodayRows: rentPaid.ok ? rentPaid.data : [],
  });

  const recentCollections = mergeRecentCollections(
    rentPaid.ok ? rentPaid.data : [],
    elecPaid.ok ? elecPaid.data : [],
  );
  const recentCollectionsError =
    !rentPaid.ok ? rentPaid.error : !elecPaid.ok ? elecPaid.error : null;

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
          { label: 'Billing Center' },
        ]}
      />
      <PageHeader
        title="Billing Center"
        description="Automatic rent generation, payment approvals, electricity bills, and collections."
        actions={
          <Link
            href="/admin/collections"
            className="inline-flex min-h-[36px] items-center rounded-lg bg-[#FF5A1F] px-3 text-xs font-semibold text-white hover:brightness-110"
          >
            Open Collections
          </Link>
        }
      />

      <BillingCommandCentreHeader
        health={billingHealth}
        roomsMissingElectricity={roomsMissingElectricity.length}
        checkoutPendingCount={billingSnapshot.moveOutCount}
      />

      <div className="mb-4">
        <ElectricityDuplicateWarningBanner />
      </div>

      <BillingCycleCertificationPanel
        reconciliation={billingSnapshot.reconciliation}
        error={billingSnapshot.reconciliationError}
      />

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

      {tab === 'dashboard' && dashboardSnapshot ? (
        <AdminSectionErrorBoundary title="Billing dashboard">
          <BillingCentreCommandDashboard
            view={dashboardSnapshot}
            filters={dashboardFilters}
            canMarkCash={canMarkCash}
            canGenerateRent={canGenerateRent}
            adminName={session.fullName ?? session.email}
          />
        </AdminSectionErrorBoundary>
      ) : null}

      {tab === 'generated' ? (
        <BillingGeneratedTodayPanel
          rows={generatedToday}
          run={
            lastRun
              ? {
                  status: lastRun.status,
                  createdCount: lastRun.createdCount,
                  failedCount: lastRun.failedCount,
                  startedAt: lastRun.startedAt.toISOString(),
                }
              : null
          }
        />
      ) : null}

      {tab === 'failures' ? (
        <BillingFailuresPanel
          failures={failures.map((f) => ({
            id: f.id,
            bookingId: f.bookingId,
            billingMonth: f.billingMonth,
            errorMessage: f.errorMessage,
            errorCode: f.errorCode,
            createdAt: f.createdAt.toISOString(),
          }))}
          runId={lastRun?.id}
        />
      ) : null}

      {tab === 'billing' ? (
        <>
          <CollectionsCommandCenter stats={collectionsStats} />
          <CollectionsActionQueue
            items={collectionsQueue}
            cashSettlement={
              canMarkCash
                ? { canSettle: true, adminName: session.fullName ?? session.email }
                : null
            }
          />
          <BillingRecentCollections
            rows={recentCollections}
            error={recentCollectionsError}
          />
          <BillingAdvancedTools
            billingMonth={billingMonth}
            canGenerateRent={canGenerateRent}
            canSendLinks={canSendLinks}
            billingOverview={billingOverview}
            billingCycleOps={billingCycleOps}
            needsBillCount={needsBillCount}
            allowManualBackfill={session.role === 'super_admin'}
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
            rows={rentPendingRows
              .filter((r) => r.dueDate)
              .map((r) => ({
                    id: r.id,
                    customerId: r.customerId,
                    customerFullName: r.customerFullName,
                    customerPhone: r.customerPhone,
                    pgId: r.pgId,
                    pgName: r.pgName,
                    roomNumber: r.roomNumber,
                    rentPaise: r.outstandingPaise,
                    dueDate: r.dueDate!,
                    isOverdue: r.effectiveStatus === 'overdue',
                  }))}
          />
          <InvoiceTable
            title="Unpaid rent bills"
            error={openRent.ok ? null : openRent.error}
            rows={rentPendingRows}
            pgNameById={pgNameById}
            financialIdMap={financialIdMap}
          />
        </>
      ) : null}

      {tab === 'electricity' ? (
        <>
          <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">Electricity bills</h2>
              <p className="mt-1 text-sm text-apg-silver">
                Create room bills from meter readings, track collection, and approve resident payments.
              </p>
            </div>
            <Link
              href={`/admin/electricity/dashboard?month=${billingMonth}`}
              className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            >
              Room dashboard →
            </Link>
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
            financialIdMap={financialIdMap}
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
          <BillingRecentCollections
            rows={recentCollections}
            error={recentCollectionsError}
          />
          <InvoiceTable
            title="Paid rent bills"
            error={rentPaid.ok ? null : rentPaid.error}
            rows={rentPaid.ok ? rentPaid.data.slice(0, 50) : []}
            pgNameById={pgNameById}
            financialIdMap={financialIdMap}
          />
        </>
      ) : null}

      {tab === 'diagnostics' ? (
        <AdminSectionErrorBoundary title="Billing diagnostics">
          <PipelineTestIntegrityPanel issues={pipelineIssues} strayZeroInvoices={strayZeroInvoices} />
          {session.role === 'super_admin' ? (
            <div className="mt-8">
              <BillingProductionRepairPanel />
            </div>
          ) : null}
          <div className="mt-8">
            <BillingHealthCardPanel health={billingHealth} />
          </div>
          <div className="mt-8">
            <BillingDiagnosticsPanel
              health={billingHealth}
              reconciliation={billingSnapshot.reconciliation}
              reconciliationError={billingSnapshot.reconciliationError}
              isSuperAdmin={session.role === 'super_admin'}
              billingMonth={billingMonth}
            />
          </div>
        </AdminSectionErrorBoundary>
      ) : null}
    </>
  );
}

function InvoiceTable({
  title,
  error,
  rows,
  pgNameById,
  financialIdMap,
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
    dueDate: string | null;
    bookingId?: string;
    isOverdue?: boolean;
  }>;
  pgNameById: Map<string, string>;
  financialIdMap: Map<string, string>;
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
                r.dueDate &&
                displayStatus !== 'paid' &&
                displayStatus !== 'cancelled';
              const sourceTable = electricity ? 'electricity_invoices' : 'rent_invoices';
              const financialInvoiceId = financialIdMap.get(`${sourceTable}:${r.id}`) ?? null;
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
                  <TD className="text-xs">{r.dueDate ? formatDate(r.dueDate) : '—'}</TD>
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
                        dueDate={r.dueDate ?? undefined}
                        roomNumber={r.roomNumber}
                        isOverdue={r.isOverdue ?? displayStatus === 'overdue'}
                        bookingId={r.bookingId}
                        financialInvoiceId={financialInvoiceId}
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
