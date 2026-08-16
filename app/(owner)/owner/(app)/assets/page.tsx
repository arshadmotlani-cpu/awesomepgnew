import { PropertyPortfolioUi } from '@/src/owner/components/wealth/PropertyPortfolioUi';
import {
  listProperties,
  getLatestValuation,
} from '@/src/owner/services/properties';
import { propertyBasisPaise } from '@/src/owner/lib/wealth/propertyValuation';
import { ownershipSharePaise } from '@/src/owner/lib/wealth/types';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import { getPropertyFinancialSummary } from '@/src/owner/services/propertyFinancials';

export default async function OwnerAssetsPage() {
  const properties = await listProperties().catch(() => []);

  const rows = await Promise.all(
    properties.map(async ({ property, asset }) => {
      try {
        const latest = await getLatestValuation(asset.id).catch(() => null);
        const basis = {
          purchasePricePaise: coerceWealthPaise(property.purchasePricePaise),
          purchaseCostsPaise: coerceWealthPaise(property.purchaseCostsPaise),
          ownershipPctBps: coerceWealthPaise(asset.ownershipPctBps),
        };
        const rawCurrent =
          latest?.valuePaise != null
            ? coerceWealthPaise(latest.valuePaise)
            : propertyBasisPaise(basis);
        const ownerCurrent = ownershipSharePaise(rawCurrent, basis.ownershipPctBps);
        const ownerBasis = ownershipSharePaise(propertyBasisPaise(basis), basis.ownershipPctBps);
        const appreciationPct =
          ownerBasis > 0 ? ((ownerCurrent - ownerBasis) / ownerBasis) * 100 : 0;

        const financials = await getPropertyFinancialSummary(asset.id, {
          ownerCurrentValuePaise: ownerCurrent,
        }).catch(() => null);

        const purchaseYear = property.purchaseDate
          ? property.purchaseDate.slice(0, 4)
          : null;

        return {
          assetId: asset.id,
          name: asset.name,
          city: property.city,
          propertyType: property.propertyType,
          purchasePricePaise: ownerBasis,
          currentValuePaise: ownerCurrent,
          appreciationPaise: ownerCurrent - ownerBasis,
          appreciationPct,
          purchaseYear,
          monthlyIncomePaise: financials?.monthlyIncomePaise ?? 0,
          monthlyExpensePaise: financials?.monthlyExpensePaise ?? 0,
          loanOutstandingPaise: financials?.loanOutstandingPaise ?? 0,
          netEquityPaise: financials?.equityPaise ?? ownerCurrent,
        };
      } catch (e) {
        console.error('[owner] assets row failed', asset.id, e);
        return null;
      }
    }),
  );

  return <PropertyPortfolioUi properties={rows.filter((r) => r != null)} />;
}
