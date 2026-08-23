import { PropertyPortfolioUi } from '@/src/owner/components/wealth/PropertyPortfolioUi';
import { MovablePortfolioUi } from '@/src/owner/components/wealth/MovablePortfolioUi';
import { AmountWithWords } from '@/src/owner/components/ui/AmountWithWords';
import {
  listProperties,
  getLatestValuation,
  getCurrentAppreciationAssumption,
} from '@/src/owner/services/properties';
import {
  getPortfolioPropertyIncomeSummary,
  getPropertyIncomeTotals,
} from '@/src/owner/services/propertyIncomeSources';
import {
  resolvePropertyValueState,
  ownerShareMarketValuePaise,
  ownerShareBasisPaise,
} from '@/src/owner/lib/wealth/propertyValuation';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import { getPropertyFinancialSummary } from '@/src/owner/services/propertyFinancials';
import { getMovableAssetDetail, listMovableAssets } from '@/src/owner/services/movableAssets';
import { ownerShareMovableValuePaise } from '@/src/owner/lib/wealth/movableAssetValuation';

export default async function OwnerAssetsPage() {
  const properties = await listProperties().catch(() => []);
  const movables = await listMovableAssets().catch(() => []);
  const portfolioIncome = await getPortfolioPropertyIncomeSummary().catch(() => null);

  const propertyRows = await Promise.all(
    properties.map(async ({ property, asset }) => {
      try {
        const latest = await getLatestValuation(asset.id).catch(() => null);
        const assumption = await getCurrentAppreciationAssumption(asset.id).catch(() => null);
        const basis = {
          purchasePricePaise: coerceWealthPaise(property.purchasePricePaise),
          purchaseCostsPaise: coerceWealthPaise(property.purchaseCostsPaise),
          ownershipPctBps: coerceWealthPaise(asset.ownershipPctBps),
        };
        const valueState = resolvePropertyValueState({
          latestValuationPaise:
            latest?.valuePaise != null ? coerceWealthPaise(latest.valuePaise) : null,
          latestValuationKind: latest?.kind,
          latestValuationNotes: latest?.notes,
          purchasePricePaise: basis.purchasePricePaise,
          purchaseDate: property.purchaseDate,
          annualRateBps: assumption?.annualRateBps,
        });
        const ownerCurrent = ownerShareMarketValuePaise(
          valueState.currentValueForNetWorthPaise,
          basis.ownershipPctBps,
        );
        const ownerBasis = ownerShareBasisPaise(basis);
        const appreciationPct =
          ownerBasis > 0 ? ((ownerCurrent - ownerBasis) / ownerBasis) * 100 : 0;

        const financials = await getPropertyFinancialSummary(asset.id, {
          ownerCurrentValuePaise: ownerCurrent,
        }).catch(() => null);

        const incomeTotals = await getPropertyIncomeTotals(asset.id).catch(() => null);

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
          annualRatePct: assumption ? assumption.annualRateBps / 100 : null,
          valueSource: valueState.valueSource,
          monthlyIncomePaise: incomeTotals?.grossMonthlyPaise ?? financials?.monthlyIncomePaise ?? 0,
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

  const movableRows = await Promise.all(
    movables.map(async ({ movable, asset }) => {
      const detail = await getMovableAssetDetail(asset.id).catch(() => null);
      const ownerCurrent = detail?.ownerCurrentValuePaise ?? 0;
      const ownerPurchase = ownerShareMovableValuePaise(
        coerceWealthPaise(movable.purchasePricePaise),
        asset.ownershipPctBps,
      );
      return {
        assetId: asset.id,
        name: asset.name,
        movableType: movable.movableType,
        make: movable.make,
        model: movable.model,
        purchasePricePaise: ownerPurchase,
        currentValuePaise: ownerCurrent,
        purchaseDate: movable.purchaseDate,
        isDepreciation: movable.isDepreciation === 1,
        annualRatePct: Math.abs(movable.annualRateBps) / 100,
      };
    }),
  );

  return (
    <div className="oo-page-stack">
      <header>
        <h1 className="oo-page-title">Assets</h1>
        <p className="oo-page-subtitle">
          Property / fixed assets, movable assets, and financial holdings — each with its own
          valuation model.
        </p>
      </header>
      {portfolioIncome ? (
        <div className="oo-stat-grid">
          <div className="oo-card oo-card-compact">
            <p className="oo-label">Portfolio properties</p>
            <p className="oo-money-primary mt-1">{portfolioIncome.propertyCount}</p>
          </div>
          <div className="oo-card oo-card-compact oo-card-cashflow">
            <p className="oo-label">Total property income / month</p>
            <p className="oo-money-primary mt-1 oo-value-income">
              <AmountWithWords paise={portfolioIncome.totalGrossMonthlyPaise} />
            </p>
          </div>
          <div className="oo-card oo-card-compact">
            <p className="oo-label">Active income sources</p>
            <p className="oo-money-primary mt-1">{portfolioIncome.totalActiveSources}</p>
          </div>
          <div className="oo-card oo-card-compact">
            <p className="oo-label">Vacant sources</p>
            <p className="oo-money-primary mt-1">{portfolioIncome.totalVacantSources}</p>
          </div>
        </div>
      ) : null}
      <PropertyPortfolioUi properties={propertyRows.filter((r) => r != null)} />
      {movableRows.length > 0 ? (
        <MovablePortfolioUi movables={movableRows} />
      ) : (
        <section className="oo-form-section">
          <h2 className="oo-section-heading">Movable assets</h2>
          <p className="oo-meta">
            Cars, jewellery, and equipment appear here — separate from property appreciation.
          </p>
        </section>
      )}
    </div>
  );
}
