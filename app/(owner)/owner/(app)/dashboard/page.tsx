import { OwnerHomeDashboard } from '@/src/owner/components/OwnerHomeDashboard';
import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';

export default async function OwnerDashboardPage() {
  const snapshot = await getOwnerOsSnapshot().catch((e) => {
    console.error('[owner] dashboard snapshot failed', e);
    return null;
  });

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

  return <OwnerHomeDashboard snapshot={snapshot} />;
}
