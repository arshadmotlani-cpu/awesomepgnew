import { OWNER_OS_BRAIN_REGISTRY } from '@/src/owner/brains/registry';
import { loadOwnerInboxStatus } from '@/src/owner/lib/events/recentEvents';
import { hasOwnerDatabaseUrl } from '@/src/owner/lib/db/env';

export default async function OwnerSettingsPage() {
  const inbox = await loadOwnerInboxStatus();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-lg font-semibold text-white">Settings</h1>
        <p className="text-sm text-[color:var(--oo-muted)]">Owner OS · host owner.awesomepg.in</p>
      </header>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-5 text-sm">
        <h2 className="font-medium text-white">Database</h2>
        <p className="mt-2 text-[color:var(--oo-muted)]">
          {hasOwnerDatabaseUrl()
            ? 'OWNER_DATABASE_URL is configured (isolated from PG / Hair / Capital).'
            : 'OWNER_DATABASE_URL is not set. Auth and event inbox require a dedicated Neon DB.'}
        </p>
      </section>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-5 text-sm">
        <h2 className="font-medium text-white">Event inbox</h2>
        <p className="mt-2 text-[color:var(--oo-muted)]">
          {inbox
            ? `${inbox.total} total · ${inbox.pending} pending drain`
            : 'Inbox unavailable — configure OWNER_DATABASE_URL.'}
        </p>
      </section>

      <section className="rounded-xl border border-white/10 bg-[color:var(--oo-surface)] p-5 text-sm">
        <h2 className="font-medium text-white">Registered Brains</h2>
        <ul className="mt-3 space-y-2">
          {OWNER_OS_BRAIN_REGISTRY.map((b) => (
            <li key={b.id} className="flex justify-between gap-3">
              <span className="text-white">{b.name}</span>
              <span className="text-[color:var(--oo-muted)]">{b.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
