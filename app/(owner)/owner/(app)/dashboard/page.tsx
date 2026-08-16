import { OwnerHomeDashboard } from '@/src/owner/components/OwnerHomeDashboard';
import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import { getWealthSnapshot } from '@/src/owner/services/wealthCalculation';
import { listLiabilities, getLiabilityDue } from '@/src/owner/services/liabilities';
import { loadCapitalContribution } from '@/src/personalFinance/adapters/capital';
import { coerceWealthPaise } from '@/src/owner/lib/wealth/paiseCoercion';

export default async function OwnerDashboardPage() {
  const [snapshot, capital, wealth] = await Promise.all([
    getOwnerOsSnapshot().catch((e) => {
      console.error('[owner] dashboard snapshot failed', e);
      return null;
    }),
    loadCapitalContribution().catch(() => null),
    getWealthSnapshot({
      investmentValuePaise: 0,
    }).catch(() => null),
  ]);

  let upcomingDues: Array<{ id: string; name: string; totalDuePaise: number; dueDate: string | null }> = [];
  try {
    const liabilities = await listLiabilities();
    upcomingDues = await Promise.all(
      liabilities.map(async (l) => {
        const due = await getLiabilityDue(l.id);
        return {
          id: l.id,
          name: l.name,
          totalDuePaise: coerceWealthPaise(due?.totalDuePaise ?? 0),
          dueDate: due?.dueDate ?? null,
        };
      }),
    );
    upcomingDues = upcomingDues
      .filter((d) => d.totalDuePaise > 0)
      .sort((a, b) => b.totalDuePaise - a.totalDuePaise);
  } catch {
    // ledger not migrated yet
  }

  const investmentPaise = capital?.assetsPaise?.paise ?? 0;
  const wealthWithInvestments =
    wealth && investmentPaise > 0
      ? await getWealthSnapshot({ investmentValuePaise: investmentPaise }).catch(() => wealth)
      : wealth;

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-5">
        <h1 className="text-lg font-semibold text-white">Owner OS</h1>
        <p className="mt-2 text-sm text-[color:var(--oo-muted)]">
          Personal Finance Brain snapshot could not load. Engine adapters may be offline — no fake
          data is shown.
        </p>
      </div>
    );
  }

  return (
    <OwnerHomeDashboard
      snapshot={snapshot}
      wealth={wealthWithInvestments}
      upcomingDues={upcomingDues}
    />
  );
}
