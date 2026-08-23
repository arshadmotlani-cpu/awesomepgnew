import { getWealthSnapshot } from '@/src/owner/services/wealthCalculation';
import { listLiabilities, getLiabilityDue } from '@/src/owner/services/liabilities';
import { loadCapitalContribution } from '@/src/personalFinance/adapters/capital';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';
import { NetWorthStatement } from '@/src/owner/components/NetWorthStatement';

export const dynamic = 'force-dynamic';

export default async function NetWorthPage() {
  const [capital, wealthBase] = await Promise.all([
    loadCapitalContribution().catch(() => null),
    getWealthSnapshot({ investmentValuePaise: 0 }).catch(() => null),
  ]);

  const investmentPaise = capital?.assetsPaise?.paise ?? 0;
  const wealth =
    wealthBase && investmentPaise > 0
      ? await getWealthSnapshot({ investmentValuePaise: investmentPaise }).catch(() => wealthBase)
      : wealthBase;

  if (!wealth) {
    return (
      <div className="oo-empty-state">
        <p className="text-sm font-medium text-white">Wealth ledger not available</p>
        <p className="oo-meta mt-2">
          Run Owner DB migrations to enable ledger-backed net worth.
        </p>
      </div>
    );
  }

  let liabilityRows: Array<{ id: string; name: string; balancePaise: number }> = [];
  try {
    const liabilities = await listLiabilities();
    liabilityRows = await Promise.all(
      liabilities.map(async (l) => {
        const due = await getLiabilityDue(l.id).catch(() => null);
        // Same balance used in getTotalLiabilityPaise: principal + accrued interest.
        const balancePaise =
          coerceWealthPaise(l.currentPrincipalPaise) +
          coerceWealthPaise(due?.interestDuePaise ?? 0);
        return {
          id: l.id,
          name: l.name,
          balancePaise,
        };
      }),
    );
  } catch {
    // ledger not migrated yet
  }

  return (
    <NetWorthStatement
      totalAssetsPaise={wealth.totalAssetsPaise}
      totalLiabilitiesPaise={wealth.totalLiabilitiesPaise}
      netWorthPaise={wealth.netWorthPaise}
      grossNetWorthPaise={wealth.grossNetWorthPaise}
      assetBreakdown={wealth.assetBreakdown}
      liabilities={liabilityRows}
      asOf={wealth.asOf}
    />
  );
}
