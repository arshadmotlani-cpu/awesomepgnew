import { notFound } from 'next/navigation';
import { PropertyDetailUi } from '@/src/owner/components/wealth/PropertyDetailUi';
import { getPropertyDetail } from '@/src/owner/services/properties';
import { yearlyProjectionsFromValue } from '@/src/owner/lib/wealth/propertyValuation';
import { computePropertyAnalytics } from '@/src/owner/lib/wealth/propertyAnalytics';
import { getPropertyIncomeTotals } from '@/src/owner/services/propertyIncomeSources';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import {
  getPropertyFinancialSummary,
  listPropertyIncomeHistory,
} from '@/src/owner/services/propertyFinancials';
import { getOwnerPgName } from '@/src/owner/services/pgOptions';
import { ownerDb } from '@/src/owner/db/client';
import { ooLiabilities } from '@/src/owner/db/schema';
import { and, eq } from 'drizzle-orm';

export default async function OwnerAssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getPropertyDetail(id).catch(() => null);
  if (!detail) notFound();

  const appreciation = {
    appreciationPaise: coerceWealthPaise(detail.appreciation.appreciationPaise),
    appreciationPct: detail.appreciation.appreciationPct,
    annualizedPct: detail.appreciation.annualizedPct,
    ownerBasisPaise: coerceWealthPaise(detail.appreciation.ownerBasisPaise),
    ownerCurrentValuePaise: coerceWealthPaise(detail.appreciation.ownerCurrentValuePaise),
  };

  const purchasePricePaise = coerceWealthPaise(detail.property.purchasePricePaise);
  const purchaseCostsPaise = coerceWealthPaise(detail.property.purchaseCostsPaise);
  const ownerPurchasePricePaise = Math.round(
    (purchasePricePaise * coerceWealthPaise(detail.asset.ownershipPctBps)) / 10000,
  );
  const ownerPurchaseCostsPaise = Math.round(
    (purchaseCostsPaise * coerceWealthPaise(detail.asset.ownershipPctBps)) / 10000,
  );

  const ownerMarketValuePaise = coerceWealthPaise(detail.ownerMarketValuePaise);
  const ownerEstimatedMarketValuePaise = coerceWealthPaise(detail.ownerEstimatedMarketValuePaise);
  const valueState = detail.valueState;
  const ownerEstimatedAppreciationPaise = ownerEstimatedMarketValuePaise - ownerPurchasePricePaise;
  const currentYear = new Date().getFullYear();
  const yearlyProjections =
    detail.assumption
      ? yearlyProjectionsFromValue(
          ownerMarketValuePaise,
          coerceWealthPaise(detail.assumption.annualRateBps),
          currentYear,
          5,
        )
      : [];

  const financials = await getPropertyFinancialSummary(id, {
    ownerCurrentValuePaise: ownerMarketValuePaise,
  });

  const monthBounds = { start: new Date().toISOString().slice(0, 7) + '-01', end: new Date().toISOString().slice(0, 10) };
  const incomeTotals = await getPropertyIncomeTotals(id, {
    periodStart: monthBounds.start,
    periodEnd: monthBounds.end,
  });

  const analytics = computePropertyAnalytics({
    ownerBasisPaise: coerceWealthPaise(detail.ownerAcquisitionBasisPaise),
    ownerCurrentValuePaise: ownerMarketValuePaise,
    yearlyIncomePaise: financials?.yearlyIncomePaise ?? incomeTotals.grossAnnualizedPaise,
    yearlyExpensePaise: financials?.yearlyExpensePaise ?? 0,
    purchaseDate: detail.property.purchaseDate,
  });

  const incomeHistory = await listPropertyIncomeHistory(id).catch(() => []);

  const linkedPgId = detail.property.linkedPgId ?? detail.asset.linkedPgId;
  const linkedPgName = linkedPgId ? await getOwnerPgName(linkedPgId) : null;

  const liabilities = await ownerDb
    .select({
      id: ooLiabilities.id,
      name: ooLiabilities.name,
      currentPrincipalPaise: ooLiabilities.currentPrincipalPaise,
      fixedPaymentPaise: ooLiabilities.fixedPaymentPaise,
    })
    .from(ooLiabilities)
    .where(and(eq(ooLiabilities.assetId, id), eq(ooLiabilities.isActive, 1)));

  return (
    <PropertyDetailUi
      detail={{
        asset: {
          id: detail.asset.id,
          name: detail.asset.name,
          ownershipPctBps: coerceWealthPaise(detail.asset.ownershipPctBps),
        },
        property: {
          city: detail.property.city,
          purchaseDate: detail.property.purchaseDate,
          purchasePricePaise: ownerPurchasePricePaise,
          purchaseCostsPaise: ownerPurchaseCostsPaise,
          propertyType: detail.property.propertyType,
          linkedPgId,
          linkedPgName,
        },
        acquisitionBasisPaise: coerceWealthPaise(detail.acquisitionBasisPaise),
        ownerAcquisitionBasisPaise: coerceWealthPaise(detail.ownerAcquisitionBasisPaise),
        currentMarketValuePaise: coerceWealthPaise(detail.currentMarketValuePaise),
        ownerMarketValuePaise,
        ownerEstimatedMarketValuePaise,
        valueSource: valueState.valueSource,
        yearsHeld: valueState.yearsHeld,
        estimatedAppreciationPaise: ownerEstimatedAppreciationPaise,
        estimatedAppreciationPct: valueState.estimatedAppreciationPct,
        appreciation,
        valuations: detail.valuations.map((v) => ({
          id: v.id,
          valuationDate: v.valuationDate,
          valuePaise: coerceWealthPaise(v.valuePaise),
          kind: v.kind,
        })),
        assumption: detail.assumption
          ? { annualRateBps: coerceWealthPaise(detail.assumption.annualRateBps) }
          : null,
        yearlyProjections,
        financials: financials
          ? {
              monthlyIncomePaise: financials.monthlyIncomePaise,
              monthlyExpensePaise: financials.monthlyExpensePaise,
              yearlyIncomePaise: financials.yearlyIncomePaise,
              yearlyExpensePaise: financials.yearlyExpensePaise,
              netMonthlyIncomePaise: financials.netMonthlyIncomePaise,
              netYearlyIncomePaise: financials.netYearlyIncomePaise,
              actualMonthlyIncomePaise: financials.actualMonthlyIncomePaise,
              actualYearlyIncomePaise: financials.actualYearlyIncomePaise,
              loanOutstandingPaise: financials.loanOutstandingPaise,
              monthlyEmiPaise: financials.monthlyEmiPaise,
              nextDueDate: financials.nextDueDate,
              nextDueAmountPaise: financials.nextDueAmountPaise,
              equityPaise: financials.equityPaise,
              incomeSources: financials.incomeSources,
            }
          : {
              monthlyIncomePaise: 0,
              monthlyExpensePaise: 0,
              yearlyIncomePaise: 0,
              yearlyExpensePaise: 0,
              netMonthlyIncomePaise: 0,
              netYearlyIncomePaise: 0,
              actualMonthlyIncomePaise: 0,
              actualYearlyIncomePaise: 0,
              loanOutstandingPaise: 0,
              monthlyEmiPaise: 0,
              nextDueDate: null,
              nextDueAmountPaise: 0,
              equityPaise: ownerMarketValuePaise,
              incomeSources: {
                journalPaise: 0,
                integrationPaise: 0,
                configuredBaselinePaise: 0,
                incomeSourceGrossMonthlyPaise: 0,
              },
            },
        incomeHistory: incomeHistory.map((e) => ({
          id: e.id,
          date: e.date,
          description: e.description,
          sourceSystem: e.sourceSystem,
          amountPaise: e.amountPaise,
        })),
        liabilities: liabilities.map((l) => ({
          id: l.id,
          name: l.name,
          currentPrincipalPaise: coerceWealthPaise(l.currentPrincipalPaise),
          fixedPaymentPaise: l.fixedPaymentPaise
            ? coerceWealthPaise(l.fixedPaymentPaise)
            : null,
        })),
        incomeTotals,
        grossRentalYieldPct: analytics.rentalYieldPct,
        netRentalYieldPct: analytics.netRentalYieldPct,
      }}
    />
  );
}
