import {
  getBusinessMetricsSummary,
  getPgBusinessMetrics,
  type BusinessMetricsSummary,
  type PgBusinessMetrics,
} from '@/src/db/queries/admin';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import type { AdminSession } from '@/src/lib/auth/session';
import { cache } from 'react';
import { adminRequestScopeKey } from '@/src/lib/admin/adminRequestCache';
import { profileAdminStep } from '@/src/lib/admin/adminProfile';
import { syncActionItems } from '@/src/services/actionItems';
import type { ExecutiveMetrics } from '@/src/services/executiveMetrics';
import {
  loadOverviewReportingSnapshot,
  type OverviewReportingSnapshot,
} from '@/src/services/overviewReportingService';

/** Full overview context — reporting snapshot plus revenue-module summary fields. */
export type OverviewContext = OverviewReportingSnapshot & {
  summary: BusinessMetricsSummary;
  pgMetrics: PgBusinessMetrics[];
  executiveMetrics: ExecutiveMetrics | null;
};

export async function loadOverviewContext(
  session: AdminSession,
  billingMonthInput?: string,
  opts?: { syncActions?: boolean },
): Promise<
  | { ok: true; data: OverviewContext }
  | { ok: false; error: string; partial?: { billingMonth: string; monthLabel: string } }
> {
  return loadOverviewContextForRequest(
    adminRequestScopeKey(session),
    session,
    billingMonthInput,
    opts?.syncActions === true,
  );
}

const loadOverviewContextForRequest = cache(
  async (
    scopeKey: string,
    session: AdminSession,
    billingMonthInput: string | undefined,
    syncActions: boolean,
  ): Promise<
    | { ok: true; data: OverviewContext }
    | { ok: false; error: string; partial?: { billingMonth: string; monthLabel: string } }
  > => {
    void scopeKey;
    return profileAdminStep('loadOverviewContext', () =>
      loadOverviewContextImpl(session, billingMonthInput, syncActions),
    );
  },
);

async function loadOverviewContextImpl(
  session: AdminSession,
  billingMonthInput: string | undefined,
  syncActions: boolean,
): Promise<
  | { ok: true; data: OverviewContext }
  | { ok: false; error: string; partial?: { billingMonth: string; monthLabel: string } }
> {
  const billingMonth = resolveBillingMonth(billingMonthInput);
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${billingMonth}T00:00:00.000Z`));

  if (syncActions) {
    await syncActionItems(session).catch(() => undefined);
    const { reconcileStaleFinancialInvoices } = await import('@/src/lib/billing/financialMetrics');
    await reconcileStaleFinancialInvoices({ billingMonth }).catch(() => undefined);
  }

  const [reporting, summary, metrics, executiveMetrics] = await Promise.all([
    loadOverviewReportingSnapshot(session, billingMonth),
    getBusinessMetricsSummary(billingMonth),
    getPgBusinessMetrics(billingMonth),
    import('@/src/services/executiveMetrics').then((m) =>
      m.getExecutiveMetrics(billingMonth).catch(() => null),
    ),
  ]);

  if (!summary.ok) {
    return { ok: false, error: summary.error, partial: { billingMonth, monthLabel } };
  }
  if (!metrics.ok) {
    return { ok: false, error: metrics.error, partial: { billingMonth, monthLabel } };
  }

  return {
    ok: true,
    data: {
      ...reporting,
      summary: summary.data,
      pgMetrics: metrics.data,
      executiveMetrics,
    },
  };
}
