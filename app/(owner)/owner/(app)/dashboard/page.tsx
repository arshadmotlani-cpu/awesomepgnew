import { OwnerLifeDashboard } from '@/src/components/admin/overview/owner/OwnerLifeDashboard';
import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';
import Link from 'next/link';

export default async function OwnerDashboardPage() {
  const snapshot = await getOwnerOsSnapshot().catch((e) => {
    console.error('[owner] dashboard snapshot failed', e);
    return null;
  });

  return (
    <div className="space-y-8">
      {snapshot ? (
        <OwnerLifeDashboard finance={snapshot.finance} />
      ) : (
        <div className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-5">
          <h1 className="text-lg font-semibold text-white">Owner OS dashboard</h1>
          <p className="mt-2 text-sm text-[color:var(--oo-muted)]">
            Personal Finance Brain snapshot could not load. Engine adapters may be offline —
            no fake data is shown.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-5">
        <h2 className="text-sm font-medium text-white">Owner OS Brain registry</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(snapshot?.brainRegistry ?? []).map((b) => (
            <li key={b.id} className="flex justify-between gap-3 border-t border-white/5 pt-2">
              <span className="text-white">{b.name}</span>
              <span className="text-[color:var(--oo-muted)]">{b.status}</span>
            </li>
          ))}
        </ul>
        {!hasOwnerDatabaseUrl() ? (
          <p className="mt-4 text-xs text-amber-300">
            OWNER_DATABASE_URL is not set — auth/event tables unavailable until configured.
          </p>
        ) : null}
        <p className="mt-4 text-xs text-[color:var(--oo-muted)]">
          <Link href="/net-worth" className="text-[#FF5A1F] underline">
            Net Worth Brain
          </Link>{' '}
          · Phase 1 scaffold — more Engines connect later.
        </p>
      </section>
    </div>
  );
}
