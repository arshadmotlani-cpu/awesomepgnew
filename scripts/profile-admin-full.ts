/**
 * Multi-page admin SSR loader profile — production Neon via .env.prod.live:
 *
 *   ADMIN_PROFILE=1 ADMIN_DB_PROFILE=1 npx tsx scripts/profile-admin-full.ts --label after
 *
 * Writes JSON to test-results/admin-perf-{label}.json
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AdminSession } from '../src/lib/auth/session';
import type { AdminDbProfileSnapshot } from '../src/lib/admin/adminDbProfile';

type StepTimings = Record<string, number>;

type PageResult = {
  page: string;
  scenario: string;
  layoutMs: number;
  pageMs: number;
  totalMs: number;
  db: AdminDbProfileSnapshot;
  queueBuilds: number;
  paymentReviewFetches: number;
  steps: StepTimings;
  cacheHits?: StepTimings;
};

type ProfileReport = {
  label: string;
  runAt: string;
  billingMonth: string;
  pages: PageResult[];
  cacheVerification: StepTimings;
  notes: string[];
};

function parseLabel(argv: string[]): string {
  const idx = argv.indexOf('--label');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  return 'local';
}

function parseBaseline(argv: string[]): boolean {
  return argv.includes('--baseline');
}

function parseQuick(argv: string[]): boolean {
  return argv.includes('--quick');
}

function parseOnlyPages(argv: string[]): Set<string> | null {
  const idx = argv.indexOf('--only');
  if (idx < 0 || !argv[idx + 1]) return null;
  return new Set(
    argv[idx + 1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

function shouldRunPage(only: Set<string> | null, key: string): boolean {
  return !only || only.has(key.toLowerCase());
}

function superAdminSession(): AdminSession {
  return {
    kind: 'admin',
    sessionId: '00000000-0000-4000-8000-000000000099',
    adminId: '00000000-0000-4000-8000-000000000099',
    email: 'profile@local',
    fullName: 'Profile Script',
    role: 'super_admin',
    pgScope: [],
    mustChangePassword: false,
    rememberMe: false,
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function timedStep<T>(
  steps: StepTimings,
  label: string,
  fn: () => Promise<T>,
  log = true,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    steps[label] = ms;
    if (log) console.log(`${label.padEnd(52)} ${ms}ms`);
  }
}

async function simulateLayout(
  session: AdminSession,
  steps: StepTimings,
  loadAdminNavBadges: (s: AdminSession) => Promise<unknown>,
  getResolvedSidebarLayout: (s: AdminSession) => Promise<unknown>,
): Promise<number> {
  const layoutStart = performance.now();
  await timedStep(steps, 'layout: loadAdminNavBadges', () => loadAdminNavBadges(session));
  await timedStep(steps, 'layout: getResolvedSidebarLayout', () =>
    getResolvedSidebarLayout(session),
  );
  return Math.round(performance.now() - layoutStart);
}

async function runPageProfile(
  name: string,
  scenario: string,
  run: (ctx: {
    session: AdminSession;
    steps: StepTimings;
    billingMonth: string;
    todayIst: string;
  }) => Promise<{ layoutMs?: number } | void>,
  deps: {
    resetUnifiedQueueBuildCount: () => void;
    getUnifiedQueueBuildCount: () => number;
    resetPaymentReviewFetchCount: () => void;
    getPaymentReviewFetchCount: () => number;
    resetAdminDbProfile: () => void;
    snapshotAdminDbProfile: () => AdminDbProfileSnapshot;
  },
  session: AdminSession,
  billingMonth: string,
  todayIst: string,
): Promise<PageResult> {
  deps.resetUnifiedQueueBuildCount();
  deps.resetPaymentReviewFetchCount();
  deps.resetAdminDbProfile();

  const steps: StepTimings = {};
  console.log(`\n=== ${name} (${scenario}) ===\n`);

  const totalStart = performance.now();
  let layoutMs = 0;
  const pageStart = performance.now();

  const runMeta = await run({ session, steps, billingMonth, todayIst });
  if (runMeta?.layoutMs != null) layoutMs = runMeta.layoutMs;

  const pageMs = Math.round(performance.now() - pageStart - layoutMs);
  const totalMs = Math.round(performance.now() - totalStart);

  const result: PageResult = {
    page: name,
    scenario,
    layoutMs,
    pageMs,
    totalMs,
    db: deps.snapshotAdminDbProfile(),
    queueBuilds: deps.getUnifiedQueueBuildCount(),
    paymentReviewFetches: deps.getPaymentReviewFetchCount(),
    steps,
  };

  console.log(
    `\n  total ${totalMs}ms | db ${result.db.totalDbMs}ms | queries ${result.db.queryCount} | dup ${result.db.duplicateQueryCount} | queue builds ${result.queueBuilds}`,
  );

  return result;
}

async function main() {
  process.env.ADMIN_PROFILE = '1';
  process.env.ADMIN_DB_PROFILE = '1';

  const label = parseLabel(process.argv);
  const baseline = parseBaseline(process.argv);
  const quick = parseQuick(process.argv);
  const onlyPages = parseOnlyPages(process.argv);

  const { loadProductionAuditEnv, requireDatabaseUrl } = await import('../src/lib/db/loadEnv');
  loadProductionAuditEnv();
  requireDatabaseUrl('profile-admin-full');

  const { resetAdminDbProfile, snapshotAdminDbProfile } = await import(
    '../src/lib/admin/adminDbProfile'
  );
  const { loadAdminNavBadges } = await import('../src/services/adminNavBadges');
  const { getResolvedSidebarLayout } = await import('../src/services/sidebarLayouts');
  const { loadOverviewContext } = await import('../src/services/overviewData');
  const { buildOverviewDashboard } = await import('../src/services/overviewDashboard');
  const { loadBillingReconciliationSafe } = await import('../src/services/billingCycleReconciliation');
  const { loadUnifiedOperationsQueue } = await import('../src/services/unifiedOperationsQueue');
  const {
    resetUnifiedQueueBuildCount,
    getUnifiedQueueBuildCount,
  } = await import('../src/services/unifiedOperationsQueue');
  const {
    resetPaymentReviewFetchCount,
    getPaymentReviewFetchCount,
  } = await import('../src/services/paymentProofQueue');
  const { listRecentPaymentProofRejectionsForAdmin } = await import(
    '../src/services/paymentProofRejectionService'
  );
  const { loadBillingCommandCenterSnapshot } = await import('../src/services/billingCommandCenter');
  const { getRevenueCommandCenterData } = await import('../src/services/revenueCommandCenter');
  const { loadInvoiceOutstandingSnapshot } = await import('../src/services/financialSummaryService');
  const { getBillingHealthSnapshot } = await import('../src/services/billingHealth');
  const { loadBillingCentreDashboardSnapshot } = await import('../src/services/billingCentreDashboard');
  const { listRentBillingOverview, listBillingCycleOperations } = await import('../src/services/rentInvoices');
  const { listRoomsMissingElectricityBill } = await import('../src/services/electricityBilling');
  const { loadCollectionsDashboard } = await import('../src/services/collectionsDashboard');
  const { loadCollectionsCalendar } = await import('../src/services/collectionsCalendar');
  const { resolveFinancialInvoiceIdMap } = await import('../src/services/adminCashSettlement');
  const { todayInBillingTimezone } = await import('../src/lib/billing/billingTimezone');
  const { resolveBillingMonth } = await import('../src/lib/dateDefaults');
  const { parseBillingCentreFilters } = await import('../src/lib/admin/billingCentreDashboardPresentation');
  const { buildCollectionsQueue } = await import('../src/lib/billing/collectionsQueue');
  const { getDateCouponAdminSnapshot, listDateCouponAnalytics } = await import('../src/services/dateCouponAdmin');
  const { listPromoCouponsAdmin, getTopPromoCoupons } = await import('../src/services/promoCouponAdmin');
  const { getReferralProgramSnapshot } = await import('../src/services/referralAdmin');
  const {
    listAdminOpenRentInvoices,
    listAdminElectricityInvoicesForReminders,
    listAdminRentInvoices,
    listAdminPaidElectricityInvoices,
    listPgs,
  } = await import('../src/db/queries/admin');
  const { closeDb } = await import('../src/db/client');

  const deps = {
    resetUnifiedQueueBuildCount,
    getUnifiedQueueBuildCount,
    resetPaymentReviewFetchCount,
    getPaymentReviewFetchCount,
    resetAdminDbProfile,
    snapshotAdminDbProfile,
  };

  const session = superAdminSession();
  const billingMonth = resolveBillingMonth(undefined);
  const todayIst = todayInBillingTimezone();
  const dashboardFilters = parseBillingCentreFilters({});

  console.log(
    `\nAdmin SSR multi-page profile [${label}]${baseline ? ' (HEAD baseline simulation)' : ''}${quick ? ' (quick: primary scenarios only)' : ''}`,
  );
  console.log(`billingMonth=${billingMonth} todayIst=${todayIst}\n`);

  const pages: PageResult[] = [];

  if (shouldRunPage(onlyPages, 'overview')) {
    pages.push(
      await runPageProfile(
        'Overview',
        'default',
        async ({ session: s, steps }) => {
        const layoutMs = await simulateLayout(s, steps, loadAdminNavBadges, getResolvedSidebarLayout);
        if (baseline) {
          const [ctx] = await timedStep(steps, 'page: loadOverviewContext + reconciliation', () =>
            Promise.all([
              loadOverviewContext(s, undefined, { syncActions: false }),
              loadBillingReconciliationSafe(s),
            ]),
          );
          if (ctx.ok) {
            await timedStep(steps, 'page: buildOverviewDashboard (sync)', async () => {
              buildOverviewDashboard(ctx.data, billingMonth);
            });
          }
        } else {
          const ctx = await timedStep(steps, 'page: loadOverviewContext', () =>
            loadOverviewContext(s, undefined, { syncActions: false, reconcile: false }),
          );
          if (ctx.ok) {
            await timedStep(steps, 'page: buildOverviewDashboard (sync)', async () => {
              buildOverviewDashboard(ctx.data, billingMonth);
            });
          }
        }
        return { layoutMs };
      },
      deps,
      session,
      billingMonth,
      todayIst,
    ),
    );
  }

  async function simulateBillingTab(
    tab: string,
    steps: StepTimings,
    s: AdminSession,
    isBaseline: boolean,
  ): Promise<number> {
    const layoutMs = await simulateLayout(s, steps, loadAdminNavBadges, getResolvedSidebarLayout);

    const needsPaidData = isBaseline || tab === 'billing' || tab === 'paid';
    const needsGeneratedTab = isBaseline || tab === 'generated';
    const needsFailuresTab = isBaseline || tab === 'failures';
    const needsDiagnosticsTab = isBaseline || tab === 'diagnostics';

    const dashboardSnapshotPromise =
      isBaseline || tab === 'dashboard'
        ? loadBillingCentreDashboardSnapshot(s, billingMonth, dashboardFilters)
        : Promise.resolve(null);

    const batch = await timedStep(steps, `page: billing Promise.all (tab=${tab})`, () =>
      Promise.all([
        listAdminOpenRentInvoices(),
        listAdminElectricityInvoicesForReminders(),
        listPgs(),
        listRentBillingOverview(billingMonth),
        listRoomsMissingElectricityBill(billingMonth),
        getBillingHealthSnapshot(),
        loadBillingCommandCenterSnapshot(s, billingMonth, { reconcile: false }),
        needsPaidData
          ? listAdminRentInvoices({ status: 'paid' })
          : Promise.resolve({ ok: true as const, data: [] }),
        needsPaidData
          ? listAdminPaidElectricityInvoices()
          : Promise.resolve({ ok: true as const, data: [] }),
        tab === 'billing' ? listBillingCycleOperations() : Promise.resolve({ dueSoon: [], generatedPending: [] }),
        needsGeneratedTab || needsFailuresTab
          ? import('../src/services/billingScheduler').then((m) => m.getLatestBillingGenerationRun())
          : Promise.resolve(null),
        needsGeneratedTab
          ? import('../src/services/billingScheduler').then((m) =>
              m.listTodayGeneratedInvoices(todayIst),
            )
          : Promise.resolve([]),
        needsFailuresTab
          ? import('../src/services/billingScheduler').then((m) =>
              m.listBillingGenerationFailures({ unresolvedOnly: true, limit: 50 }),
            )
          : Promise.resolve([]),
        needsDiagnosticsTab
          ? import('../src/services/billingPipelineIntegrity').then((m) =>
              m.listPipelineTestIntegrityIssues(),
            )
          : Promise.resolve([]),
        needsDiagnosticsTab
          ? import('../src/services/billingPipelineIntegrity').then((m) =>
              m.listStrayZeroProductionInvoices(),
            )
          : Promise.resolve([]),
        dashboardSnapshotPromise,
      ]),
    );

    const [openRent, elecPending] = batch;

    const allUnpaidRent = (openRent.ok ? openRent.data : []).filter(
      (r) =>
        r.outstandingPaise > 0 &&
        r.effectiveStatus !== 'paid' &&
        r.effectiveStatus !== 'cancelled',
    );
    const allUnpaidElectricity = elecPending.ok ? elecPending.data : [];
    const collectionsQueue = buildCollectionsQueue({
      rentRows: allUnpaidRent,
      electricityRows: allUnpaidElectricity,
    });

    await timedStep(steps, 'page: resolveFinancialInvoiceIdMap', () =>
      resolveFinancialInvoiceIdMap(
        collectionsQueue.map((item) => ({
          sourceTable: item.sourceTable,
          sourceId: item.sourceId,
        })),
      ),
    );

    return layoutMs;
  }

  if (shouldRunPage(onlyPages, 'billing-dashboard')) {
    pages.push(
      await runPageProfile(
        'Billing Centre',
        'tab=dashboard',
        async ({ session: s, steps }) => {
          const layoutMs = await simulateBillingTab('dashboard', steps, s, baseline);
          return { layoutMs };
        },
        deps,
        session,
        billingMonth,
        todayIst,
      ),
    );
  }

  if (!quick && shouldRunPage(onlyPages, 'billing-billing')) {
    pages.push(
      await runPageProfile(
        'Billing Centre',
        'tab=billing',
        async ({ session: s, steps }) => {
          const layoutMs = await simulateBillingTab('billing', steps, s, baseline);
          return { layoutMs };
        },
        deps,
        session,
        billingMonth,
        todayIst,
      ),
    );
  }

  if (shouldRunPage(onlyPages, 'operations')) {
    pages.push(
      await runPageProfile(
        'Operations',
        'filter=waiting_for_approval',
      async ({ session: s, steps }) => {
        const layoutMs = await simulateLayout(s, steps, loadAdminNavBadges, getResolvedSidebarLayout);
        await timedStep(steps, 'page: loadUnifiedOperationsQueue', () =>
          loadUnifiedOperationsQueue(s, 'waiting_for_approval'),
        );
        await timedStep(steps, 'page: listRecentPaymentProofRejectionsForAdmin', () =>
          listRecentPaymentProofRejectionsForAdmin(s, 40),
        );
        return { layoutMs };
      },
      deps,
      session,
      billingMonth,
      todayIst,
    ),
    );
  }

  if (shouldRunPage(onlyPages, 'revenue')) {
    pages.push(
      await runPageProfile(
        'Revenue',
        'default',
      async ({ session: s, steps }) => {
        const layoutMs = await simulateLayout(s, steps, loadAdminNavBadges, getResolvedSidebarLayout);
        const ctx = await timedStep(steps, 'page: loadOverviewContext', () =>
          loadOverviewContext(s, billingMonth, { syncActions: false, reconcile: false }),
        );
        if (!ctx.ok) return { layoutMs };
        await timedStep(steps, 'page: coupon/referral Promise.all', () =>
          Promise.all([
            getDateCouponAdminSnapshot(),
            listDateCouponAnalytics(14),
            listPromoCouponsAdmin(),
            getTopPromoCoupons(5),
            getReferralProgramSnapshot(),
          ]),
        );
        const invoiceSnapshot = await loadInvoiceOutstandingSnapshot(s);
        await timedStep(steps, 'page: getRevenueCommandCenterData', () =>
          getRevenueCommandCenterData({ session: s, billingMonth, invoiceSnapshot }),
        );
        return { layoutMs };
      },
      deps,
      session,
      billingMonth,
      todayIst,
    ),
    );
  }

  if (shouldRunPage(onlyPages, 'collections')) {
    pages.push(
      await runPageProfile(
        'Collections',
        'queue/overdue',
      async ({ session: s, steps }) => {
        const layoutMs = await simulateLayout(s, steps, loadAdminNavBadges, getResolvedSidebarLayout);
        await timedStep(steps, 'page: collections Promise.all', () =>
          Promise.all([
            loadCollectionsDashboard({
              session: { role: s.role, pgScope: s.pgScope },
              todayIso: todayIst,
            }),
            listPgs(),
          ]),
        );
        return { layoutMs };
      },
      deps,
      session,
      billingMonth,
      todayIst,
    ),
    );
  }

  if (!quick && shouldRunPage(onlyPages, 'collections-calendar')) {
    pages.push(
      await runPageProfile(
        'Collections',
        'calendar',
        async ({ session: s, steps }) => {
          const layoutMs = await simulateLayout(s, steps, loadAdminNavBadges, getResolvedSidebarLayout);
          const month = todayIst.slice(0, 7);
          await timedStep(steps, 'page: collections calendar Promise.all', () =>
            Promise.all([
              loadCollectionsDashboard({
                session: { role: s.role, pgScope: s.pgScope },
                todayIso: todayIst,
              }),
              loadCollectionsCalendar({
                month,
                session: { role: s.role, pgScope: s.pgScope },
              }),
              listPgs(),
            ]),
          );
          return { layoutMs };
        },
        deps,
        session,
        billingMonth,
        todayIst,
      ),
    );
  }

  let cacheVerification: StepTimings = {};
  if (!onlyPages) {
    console.log('\n=== Cache verification (single simulated request) ===\n');
    resetUnifiedQueueBuildCount();
    resetPaymentReviewFetchCount();
    resetAdminDbProfile();

    await timedStep(cacheVerification, 'cache: loadAdminNavBadges #1', () =>
      loadAdminNavBadges(session),
    );
    await timedStep(cacheVerification, 'cache: loadOverviewContext #1', () =>
      loadOverviewContext(session, undefined, { syncActions: false, reconcile: false }),
    );
    await timedStep(cacheVerification, 'cache: loadBillingReconciliationSafe #1', () =>
      loadBillingReconciliationSafe(session),
    );
    await timedStep(cacheVerification, 'cache: loadInvoiceOutstandingSnapshot #1', () =>
      loadInvoiceOutstandingSnapshot(session),
    );
    await timedStep(cacheVerification, 'cache: loadUnifiedOperationsQueue #1', () =>
      loadUnifiedOperationsQueue(session, 'waiting_for_approval'),
    );

    console.log('\n--- Second calls (expect cache hits) ---\n');
    await timedStep(cacheVerification, 'cache: loadAdminNavBadges #2', () =>
      loadAdminNavBadges(session),
    );
    await timedStep(cacheVerification, 'cache: loadOverviewContext #2', () =>
      loadOverviewContext(session, undefined, { syncActions: false, reconcile: false }),
    );
    await timedStep(cacheVerification, 'cache: loadBillingReconciliationSafe #2', () =>
      loadBillingReconciliationSafe(session),
    );
    await timedStep(cacheVerification, 'cache: loadInvoiceOutstandingSnapshot #2', () =>
      loadInvoiceOutstandingSnapshot(session),
    );
    await timedStep(cacheVerification, 'cache: loadUnifiedOperationsQueue #2', () =>
      loadUnifiedOperationsQueue(session, 'waiting_for_approval'),
    );
  }

  const report: ProfileReport = {
    label,
    runAt: new Date().toISOString(),
    billingMonth,
    pages,
    cacheVerification,
    notes: [
      'Loader-equivalent SSR timings (direct service calls, not full Next.js RSC render).',
      'Each page run resets queue/review/DB counters (isolated simulated navigation).',
      'DB time approximated from inter-query gaps (concurrent queries may under-report).',
      baseline
        ? 'Baseline mode: duplicate overview reconciliation + full billing tab fetches (HEAD behavior).'
        : 'Optimized mode: deduped overview reconciliation + tab-scoped billing fetches.',
      'React cache() dedup is validated in Next.js RSC; second-call timings here are indicative only.',
    ],
  };

  const outDir = join(process.cwd(), 'test-results');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `admin-perf-${label}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}\n`);

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
