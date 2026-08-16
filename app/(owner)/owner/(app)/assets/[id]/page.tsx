import { notFound } from 'next/navigation';
import { PropertyDetailUi } from '@/src/owner/components/wealth/PropertyDetailUi';
import { getPropertyDetail } from '@/src/owner/services/properties';
import { yearlyProjectionsFromValue } from '@/src/owner/lib/wealth/propertyValuation';
import { computePropertyAnalytics } from '@/src/owner/lib/wealth/propertyAnalytics';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import { getPropertyFinancialSummary } from '@/src/owner/services/propertyFinancials';
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

  const currentYear = new Date().getFullYear();
  const yearlyProjections =
    detail.assumption
      ? yearlyProjectionsFromValue(
          appreciation.ownerCurrentValuePaise,
          coerceWealthPaise(detail.assumption.annualRateBps),
          currentYear,
          5,
        )
      : [];

  const financials = await getPropertyFinancialSummary(id, {
    ownerCurrentValuePaise: appreciation.ownerCurrentValuePaise,
  });

  const analytics = computePropertyAnalytics({
    ownerBasisPaise: appreciation.ownerBasisPaise,
    ownerCurrentValuePaise: appreciation.ownerCurrentValuePaise,
    yearlyIncomePaise: financials?.yearlyIncomePaise ?? 0,
    yearlyExpensePaise: financials?.yearlyExpensePaise ?? 0,
    purchaseDate: detail.property.purchaseDate,
  });

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
          address: detail.property.address,
          city: detail.property.city,
          state: detail.property.state,
          country: detail.property.country,
          postalCode: detail.property.postalCode,
          purchaseDate: detail.property.purchaseDate,
          purchasePricePaise: coerceWealthPaise(detail.property.purchasePricePaise),
          purchaseCostsPaise: coerceWealthPaise(detail.property.purchaseCostsPaise),
          propertyType: detail.property.propertyType,
          linkedPgId,
          linkedPgName,
          appreciationMethod: detail.property.appreciationMethod ?? 'FLAT_ANNUAL',
        },
        currentValuePaise: coerceWealthPaise(detail.currentValuePaise),
        appreciation,
        valuations: detail.valuations.map((v) => ({
          id: v.id,
          valuationDate: v.valuationDate,
          valuePaise: coerceWealthPaise(v.valuePaise),
          kind: v.kind,
        })),
        projections: detail.projections
          ? {
              oneYear: coerceWealthPaise(detail.projections.oneYear),
              threeYears: coerceWealthPaise(detail.projections.threeYears),
              fiveYears: coerceWealthPaise(detail.projections.fiveYears),
              tenYears: coerceWealthPaise(detail.projections.tenYears),
            }
          : null,
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
              loanOutstandingPaise: 0,
              monthlyEmiPaise: 0,
              nextDueDate: null,
              nextDueAmountPaise: 0,
              equityPaise: appreciation.ownerCurrentValuePaise,
              incomeSources: {
                journalPaise: 0,
                integrationPaise: 0,
                configuredBaselinePaise: 0,
              },
            },
        analytics,
        liabilities: liabilities.map((l) => ({
          id: l.id,
          name: l.name,
          currentPrincipalPaise: coerceWealthPaise(l.currentPrincipalPaise),
          fixedPaymentPaise: l.fixedPaymentPaise
            ? coerceWealthPaise(l.fixedPaymentPaise)
            : null,
        })),
      }}
    />
  );
}
