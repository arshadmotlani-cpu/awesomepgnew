import { IncomeUi } from '@/src/owner/components/wealth/IncomeUi';
import { getWealthSnapshot } from '@/src/owner/services/wealthCalculation';
import { listIncomeWithSource } from '@/src/owner/services/journal';
import { listFinancialAccounts } from '@/src/owner/services/financialAccounts';
import { listProperties } from '@/src/owner/services/properties';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

export default async function OwnerIncomePage() {
  const [snapshot, incomeRows, accounts, properties] = await Promise.all([
    getWealthSnapshot().catch(() => null),
    listIncomeWithSource({ limit: 50 }).catch(() => []),
    listFinancialAccounts().catch(() => []),
    listProperties().catch(() => []),
  ]);

  const cashFlow = snapshot?.cashFlow ?? {
    today: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    week: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    month: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    quarter: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    year: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
    lifetime: { incomePaise: 0, expensePaise: 0, netPaise: 0 },
  };

  return (
    <IncomeUi
      cashFlow={cashFlow}
      recentIncome={incomeRows.map((r) => ({
        id: r.id,
        entryDate: r.entryDate,
        description: r.description,
        sourceSystem: r.sourceSystem,
        amountPaise: coerceWealthPaise(r.amountPaise),
        assetId: r.assetId,
      }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      assets={properties.map(({ asset }) => ({ id: asset.id, name: asset.name }))}
    />
  );
}
