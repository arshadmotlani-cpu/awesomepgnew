/**
 * Owner-level income breakdown — property vs business vs other.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { ownerDb } from '@/src/owner/db/client';
import { ooIntegrationFacts, ooJournalEntries, ooJournalLines } from '@/src/owner/db/schema';
import { periodBounds, type PeriodKey } from '@/src/owner/lib/wealth/types';
import { getPortfolioPropertyIncomeSummary } from '@/src/owner/services/propertyIncomeSources';

export type OwnerIncomeBreakdown = {
  period: PeriodKey;
  periodStart: string;
  periodEnd: string;
  totalIncomePaise: number;
  propertyExpectedMonthlyPaise: number;
  propertyActualPaise: number;
  businessIncomePaise: number;
  otherIncomePaise: number;
  propertyBySource: Array<{
    assetId: string;
    name: string;
    grossMonthlyPaise: number;
  }>;
};

async function sumJournalIncomeNoAsset(startDate: string, endDate: string) {
  const [row] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooJournalLines.amountPaise}), 0)::bigint`,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(
      and(
        eq(ooJournalLines.eventType, 'INCOME'),
        gte(ooJournalEntries.entryDate, startDate),
        lte(ooJournalEntries.entryDate, endDate),
        isNull(ooJournalLines.assetId),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function getOwnerIncomeBreakdown(
  period: PeriodKey = 'month',
  asOfDate?: string,
): Promise<OwnerIncomeBreakdown> {
  const { start, end } = periodBounds(period, asOfDate ?? new Date().toISOString().slice(0, 10));

  const portfolio = await getPortfolioPropertyIncomeSummary({
    periodStart: start,
    periodEnd: end,
  });

  const [propertyJournalRow] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooJournalLines.amountPaise}), 0)::bigint`,
    })
    .from(ooJournalLines)
    .innerJoin(ooJournalEntries, eq(ooJournalLines.entryId, ooJournalEntries.id))
    .where(
      and(
        eq(ooJournalLines.eventType, 'INCOME'),
        gte(ooJournalEntries.entryDate, start),
        lte(ooJournalEntries.entryDate, end),
        sql`${ooJournalLines.assetId} IS NOT NULL`,
      ),
    );
  const propertyActualJournal = Number(propertyJournalRow?.total ?? 0);

  const [propertyIntegrationRow] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(
      and(
        inArray(ooIntegrationFacts.kind, ['REVENUE', 'PROFIT']),
        gte(ooIntegrationFacts.periodStart, start),
        lte(ooIntegrationFacts.periodEnd, end),
        sql`${ooIntegrationFacts.assetId} IS NOT NULL`,
      ),
    );
  const propertyActualIntegration = Number(propertyIntegrationRow?.total ?? 0);
  const propertyActualPaise = propertyActualJournal + propertyActualIntegration;

  const [businessRow] = await ownerDb
    .select({
      total: sql<number>`COALESCE(SUM(${ooIntegrationFacts.amountPaise}), 0)::bigint`,
    })
    .from(ooIntegrationFacts)
    .where(
      and(
        inArray(ooIntegrationFacts.kind, ['REVENUE', 'PROFIT']),
        gte(ooIntegrationFacts.periodStart, start),
        lte(ooIntegrationFacts.periodEnd, end),
        isNull(ooIntegrationFacts.assetId),
      ),
    );
  const businessIncomePaise = Number(businessRow?.total ?? 0);

  const otherJournal = await sumJournalIncomeNoAsset(start, end);

  const propertyExpectedMonthlyPaise = portfolio.totalGrossMonthlyPaise;
  const totalIncomePaise = propertyActualPaise + businessIncomePaise + otherJournal;

  return {
    period,
    periodStart: start,
    periodEnd: end,
    totalIncomePaise,
    propertyExpectedMonthlyPaise,
    propertyActualPaise,
    businessIncomePaise,
    otherIncomePaise: otherJournal,
    propertyBySource: portfolio.properties,
  };
}
