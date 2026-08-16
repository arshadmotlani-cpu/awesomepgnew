import { notFound } from 'next/navigation';
import { PropertyDetailUi } from '@/src/owner/components/wealth/PropertyDetailUi';
import { getPropertyDetail } from '@/src/owner/services/properties';
import { yearlyProjectionsFromValue } from '@/src/owner/lib/wealth/propertyValuation';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

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
          purchaseDate: detail.property.purchaseDate,
          purchasePricePaise: coerceWealthPaise(detail.property.purchasePricePaise),
          purchaseCostsPaise: coerceWealthPaise(detail.property.purchaseCostsPaise),
          propertyType: detail.property.propertyType,
          linkedPgId: detail.property.linkedPgId,
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
      }}
    />
  );
}
