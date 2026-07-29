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

/**
 * Overview context — reporting snapshot + optional executive metrics.
 * Money (Today / MTD / Property Performance) comes only from
 * `revenue` (= getRevenueCommandCenterData). Do not re-attach parallel
 * getCachedPgBusinessMetrics / BusinessMetricsSummary here.
 */
export type OverviewContext = OverviewReportingSnapshot & {
  executiveMetrics: ExecutiveMetrics | null;
};

export async function loadOverviewContext(
  session: AdminSession,
  billingMonthInput?: string,
  opts?: { syncActions?: boolean; reconcile?: boolean },
): Promise<
  | { ok: true; data: OverviewContext }
  | { ok: false; error: string; partial?: { billingMonth: string; monthLabel: string } }
> {
  return loadOverviewContextForRequest(
    adminRequestScopeKey(session),
    session,
    billingMonthInput,
    opts?.syncActions === true,
    opts?.reconcile !== false,
  );
}

const loadOverviewContextForRequest = cache(
  async (
    scopeKey: string,
    session: AdminSession,
    billingMonthInput: string | undefined,
    syncActions: boolean,
    reconcile: boolean,
  ): Promise<
    | { ok: true; data: OverviewContext }
    | { ok: false; error: string; partial?: { billingMonth: string; monthLabel: string } }
  > => {
    void scopeKey;
    return profileAdminStep('loadOverviewContext', () =>
      loadOverviewContextImpl(session, billingMonthInput, syncActions, reconcile),
    );
  },
);

async function loadOverviewContextImpl(
  session: AdminSession,
  billingMonthInput: string | undefined,
  syncActions: boolean,
  reconcile: boolean,
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

  let reporting: Awaited<ReturnType<typeof loadOverviewReportingSnapshot>>;
  try {
    reporting = await loadOverviewReportingSnapshot(session, billingMonth, { reconcile });
  } catch (err) {
    console.error('[overview] reporting snapshot failed', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Overview data unavailable',
      partial: { billingMonth, monthLabel },
    };
  }

  const executiveMetrics = await import('@/src/services/executiveMetrics')
    .then((m) => m.getExecutiveMetrics(billingMonth).catch(() => null))
    .catch(() => null);

  return {
    ok: true,
    data: {
      ...reporting,
      executiveMetrics,
    },
  };
}
