import { getNetWorthSnapshot } from '@/src/owner/brains/netWorthBrain';
import { OwnerLifeDashboard } from '@/src/components/admin/overview/owner/OwnerLifeDashboard';
import { getPersonalFinanceSnapshot } from '@/src/owner/finance/sharedFinanceApi';

export default async function OwnerNetWorthPage() {
  const [netWorth, finance] = await Promise.all([
    getNetWorthSnapshot().catch(() => null),
    getPersonalFinanceSnapshot().catch(() => null),
  ]);

  if (!finance) {
    return (
      <div className="rounded-xl border border-white/10 p-5 text-sm text-[color:var(--oo-muted)]">
        Net Worth Brain has no live inputs — Engines offline or Personal Finance snapshot failed.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Net Worth Brain</p>
        <h1 className="text-lg font-semibold text-white">Net worth</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted)]">
          Assets − liabilities from Personal Finance Brain (click any number to explain).
          {netWorth ? ` · as of ${new Date(netWorth.asOf).toLocaleString('en-IN')}` : ''}
        </p>
      </header>
      <OwnerLifeDashboard finance={finance} />
    </div>
  );
}
