/**
 * FYH Salon adapter — consumes financialDashboard / revenueDashboard public snapshots only.
 */
import { getRevenueDashboardSnapshot } from '@/src/hair/services/revenueDashboard';
import { moneyValue } from '@/src/personalFinance/explain';
import type { EngineContribution } from '@/src/personalFinance/types';

export async function loadSalonContribution(): Promise<EngineContribution> {
  try {
    const snap = await getRevenueDashboardSnapshot();
    const revenuePaise = snap.mtdRevenuePaise ?? 0;
    const expensesPaise = 0;
    const profitPaise = revenuePaise - expensesPaise;

    return {
      engine: 'fyh_salon',
      label: 'FYH Salon',
      available: true,
      revenuePaise: moneyValue({
        id: 'salon_business_revenue',
        label: 'Salon revenue (MTD)',
        paise: revenuePaise,
        brain: 'finance',
        engine: 'fyh_salon',
        calculation: 'getRevenueDashboardSnapshot().mtdRevenuePaise',
        sourceApi: 'getRevenueDashboardSnapshot',
        lineage: [
          { label: 'MTD revenue', paise: revenuePaise },
          { label: 'Today', paise: snap.todayRevenuePaise ?? 0 },
        ],
      }),
      expensesPaise: moneyValue({
        id: 'salon_business_expenses',
        label: 'Salon operating expenses',
        paise: expensesPaise,
        brain: 'finance',
        engine: 'fyh_salon',
        calculation: 'No public salon opex total API — 0 provisional',
        sourceApi: 'unconnected',
        provisional: true,
        connected: false,
        lineage: [],
      }),
      profitPaise: moneyValue({
        id: 'salon_business_profit',
        label: 'Salon contribution',
        paise: profitPaise,
        brain: 'personal_finance',
        engine: 'fyh_salon',
        calculation: 'salon_revenue − salon_expenses',
        sourceApi: 'personalFinance.adapters.salon',
        lineage: [
          { label: 'Revenue', paise: revenuePaise },
          { label: 'Expenses', paise: expensesPaise },
        ],
      }),
      assetsPaise: moneyValue({
        id: 'salon_assets',
        label: 'Salon assets',
        paise: 0,
        brain: 'finance',
        engine: 'fyh_salon',
        calculation: 'Unconnected',
        sourceApi: 'unconnected',
        provisional: true,
        connected: false,
        lineage: [],
      }),
      liabilitiesPaise: moneyValue({
        id: 'salon_liabilities',
        label: 'Salon liabilities (advances)',
        paise: snap.advanceLiabilityPaise ?? 0,
        brain: 'finance',
        engine: 'fyh_salon',
        calculation: 'getRevenueDashboardSnapshot().advanceLiabilityPaise',
        sourceApi: 'getRevenueDashboardSnapshot',
        provisional: true,
        lineage: [],
      }),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Salon adapter failed';
    const zero = (id: string, label: string) =>
      moneyValue({
        id,
        label,
        paise: 0,
        brain: 'finance',
        engine: 'fyh_salon',
        calculation: msg,
        sourceApi: 'getRevenueDashboardSnapshot',
        provisional: true,
        connected: false,
      });
    return {
      engine: 'fyh_salon',
      label: 'FYH Salon',
      available: false,
      error: msg,
      revenuePaise: zero('salon_business_revenue', 'Salon revenue (MTD)'),
      expensesPaise: zero('salon_business_expenses', 'Salon operating expenses'),
      profitPaise: zero('salon_business_profit', 'Salon contribution'),
      assetsPaise: zero('salon_assets', 'Salon assets'),
      liabilitiesPaise: zero('salon_liabilities', 'Salon liabilities'),
    };
  }
}
