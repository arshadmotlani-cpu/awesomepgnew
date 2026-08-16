import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooIntegrationFacts } from '@/src/owner/db/schema';
import {
  periodBounds,
  type PeriodKey,
  type SourceSystem,
} from '@/src/owner/lib/wealth/types';
import {
  getTotalBankBalancePaise,
  sumJournalByEventType,
} from '@/src/owner/services/journal';
import { getTotalPropertyValuePaise } from '@/src/owner/services/properties';
import { getTotalLiabilityPaise } from '@/src/owner/services/liabilities';
import { sumLiabilityPrincipalPaid } from '@/src/owner/services/reconciliation';

export type WealthSnapshot = {
  asOf: string;
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  netWorthPaise: number;
  bankBalancePaise: number;
  propertyValuePaise: number;
  investmentValuePaise: number;
  cashFlow: Record<PeriodKey, {
    incomePaise: number;
    expensePaise: number;
    netPaise: number;
  }>;
  expensesBySource: Array<{ sourceSystem: SourceSystem; totalPaise: number }>;
  wealthChange: {
    operatingCashFlowPaise: number;
    liabilityPrincipalPaidPaise: number;
    unrealizedAssetChangePaise: number;
  };
};

export async function sumIntegrationFacts(opts: {
  kind: 'REVENUE' | 'EXPENSE' | 'PROFIT' | 'ASSET_VALUE' | 'LIABILITY' | 'OTHER';
  startDate?: string;
  endDate?: string;
  sourceSystem?: SourceSystem;
}) {
  const conditions = [eq(ooIntegrationFacts.kind, opts.kind)];
  if (opts.startDate) conditions.push(gte(ooIntegrationFacts.periodStart, opts.startDate));
  if (opts.endDate) conditions.push(lte(ooIntegrationFacts.periodEnd, opts.endDate));
  if (opts.sourceSystem) conditions.push(eq(ooIntegrationFacts.sourceSystem, opts.sourceSystem));

  const [row] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

export async function sumExpensesBySource(startDate?: string, endDate?: string) {
  const journalConditions = [sql`${ooIntegrationFacts.kind} = 'EXPENSE'`];
  if (startDate) journalConditions.push(gte(ooIntegrationFacts.periodStart, startDate));
  if (endDate) journalConditions.push(lte(ooIntegrationFacts.periodEnd, endDate));

  const integrationRows = await ownerDb
    .select({
      sourceSystem: ooIntegrationFacts.sourceSystem,
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(and(...journalConditions))
    .groupBy(ooIntegrationFacts.sourceSystem);

  const ownerOsJournal = await sumJournalByEventType({
    eventTypes: ['EXPENSE'],
    startDate,
    endDate,
    sourceSystem: 'OWNER_OS',
  });

  const bySource: Record<string, number> = { OWNER_OS: ownerOsJournal };
  for (const row of integrationRows) {
    bySource[row.sourceSystem] = (bySource[row.sourceSystem] ?? 0) + Number(row.total);
  }

  return Object.entries(bySource).map(([sourceSystem, totalPaise]) => ({
    sourceSystem: sourceSystem as SourceSystem,
    totalPaise,
  }));
}

export async function getWealthSnapshot(opts?: {
  asOfDate?: string;
  investmentValuePaise?: number;
}): Promise<WealthSnapshot> {
  const asOf = opts?.asOfDate ?? new Date().toISOString().slice(0, 10);

  const [bankBalancePaise, propertyValuePaise, liabilityPaise, investmentValuePaise] =
    await Promise.all([
      getTotalBankBalancePaise(),
      getTotalPropertyValuePaise(),
      getTotalLiabilityPaise(),
      opts?.investmentValuePaise ?? 0,
    ]);

  const totalAssetsPaise = bankBalancePaise + propertyValuePaise + investmentValuePaise;
  const netWorthPaise = totalAssetsPaise - liabilityPaise;

  const periods: PeriodKey[] = ['today', 'week', 'month', 'quarter', 'year', 'lifetime'];
  const cashFlow: WealthSnapshot['cashFlow'] = {
    today: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    week: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    month: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    quarter: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    year: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    lifetime: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
  };

  for (const period of periods) {
    const { start, end } = periodBounds(period, asOf);
    const journalIncome = await sumJournalByEventType({
      eventTypes: ['INCOME'],
      startDate: start,
      endDate: end,
    });
    const journalExpense = await sumJournalByEventType({
      eventTypes: ['EXPENSE'],
      startDate: start,
      endDate: end,
    });
    const integratedRevenue = await sumIntegrationFacts({
      kind: 'REVENUE',
      startDate: start,
      endDate: end,
    });
    const integratedExpense = await sumIntegrationFacts({
      kind: 'EXPENSE',
      startDate: start,
      endDate: end,
    });
    const integratedProfit = await sumIntegrationFacts({
      kind: 'PROFIT',
      startDate: start,
      endDate: end,
    });

    const incomePaise = journalIncome + integratedRevenue + integratedProfit;
    const expensePaise = journalExpense + integratedExpense;
    cashFlow[period] = {
      incomePaise,
      expensePaise,
      netPaise: incomePaise - expensePaise,
    };
  }

  const monthBounds = periodBounds('month', asOf);
  const expensesBySource = await sumExpensesBySource(monthBounds.start, monthBounds.end);

  const liabilityPrincipalPaid = await sumLiabilityPrincipalPaid({
    startDate: monthBounds.start,
    endDate: monthBounds.end,
  });

  return {
    asOf,
    totalAssetsPaise,
    totalLiabilitiesPaise: liabilityPaise,
    netWorthPaise,
    bankBalancePaise,
    propertyValuePaise,
    investmentValuePaise,
    cashFlow,
    expensesBySource,
    wealthChange: {
      operatingCashFlowPaise: cashFlow.month.netPaise,
      liabilityPrincipalPaidPaise: liabilityPrincipalPaid,
      unrealizedAssetChangePaise: 0,
    },
  };
}
