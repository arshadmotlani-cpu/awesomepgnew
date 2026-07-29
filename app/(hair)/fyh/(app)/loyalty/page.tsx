import Link from 'next/link';
import {
  ensureDefaultMembershipPlans,
  listBridalProfiles,
  listCommissionSummary,
  listMembershipPlans,
  listOutbox,
  listPackagePlans,
  ensureNotificationTemplates,
} from '@/src/hair/services/loyaltyOps';
import { listCustomers } from '@/src/hair/services/customers';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { LoyaltyForms } from '@/src/hair/components/loyalty/LoyaltyForms';
import { CommissionRows } from '@/src/hair/components/loyalty/CommissionRows';

export const dynamic = 'force-dynamic';

/** Combined loyalty / bridal / commission / automations console. */
export default async function LoyaltyHubPage() {
  await ensureDefaultMembershipPlans().catch(() => []);
  await ensureNotificationTemplates().catch(() => undefined);

  const [plans, packages, bridal, commissions, outbox, customers] = await Promise.all([
    listMembershipPlans().catch(() => []),
    listPackagePlans().catch(() => []),
    listBridalProfiles().catch(() => []),
    listCommissionSummary().catch(() => []),
    listOutbox(20).catch(() => []),
    listCustomers().catch(() => []),
  ]);

  const customerOpts = customers.map((c) => ({ id: c.id, fullName: c.fullName, phone: c.phone }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">Growth</p>
        <h1 className="fyh-display text-3xl font-semibold text-fyh-text">Loyalty & Ops</h1>
        <p className="text-sm text-fyh-text-secondary">
          Memberships, packages, bridal, commissions, and notification queue
        </p>
      </div>

      <LoyaltyForms
        customers={customerOpts}
        membershipPlans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          priceLabel: `${p.discountBps / 100}% · ${formatInrFromPaise(p.pricePaise)}`,
        }))}
        packagePlans={packages.map((p) => ({
          id: p.id,
          name: p.name,
          priceLabel: `${p.totalSessions} sess · ${formatInrFromPaise(p.pricePaise)}`,
        }))}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Membership plans">
          {plans.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">No plans yet.</p>
          ) : (
            plans.map((p) => (
              <Row
                key={p.id}
                label={p.name}
                value={`${p.discountBps / 100}% off · ${formatInrFromPaise(p.pricePaise)}`}
              />
            ))
          )}
        </Panel>
        <Panel title="Package plans">
          {packages.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">
              No package plans yet. Add via DB seed or create in a follow-up — checkout credits matching
              serviceId only.
            </p>
          ) : (
            packages.map((p) => (
              <Row
                key={p.id}
                label={p.name}
                value={`${p.totalSessions} sessions · ${formatInrFromPaise(p.pricePaise)}`}
              />
            ))
          )}
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Bridal profiles">
          {bridal.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">No bridal profiles yet — use the form above.</p>
          ) : (
            bridal.map((b) => (
              <Row
                key={b.profile.id}
                label={`${b.profile.brideName} · ${b.customerName}`}
                value={b.profile.weddingDate ?? 'Date TBD'}
              />
            ))
          )}
          <Link href="/customers" className="text-xs text-fyh-accent hover:underline">
            Browse customers →
          </Link>
        </Panel>
        <Panel title="Staff commissions">
          <CommissionRows
            rows={commissions.map((c) => ({
              staffId: c.staffId,
              staffName: c.staffName,
              pendingPaise: Number(c.pendingPaise),
              paidPaise: Number(c.paidPaise),
            }))}
          />
        </Panel>
      </section>

      <Panel title="Notification outbox">
        <p className="text-xs text-fyh-text-muted mb-2">
          Queued only — WhatsApp/SMS delivery is not connected yet.
        </p>
        {outbox.length === 0 ? (
          <p className="text-sm text-fyh-text-muted">No queued messages.</p>
        ) : (
          outbox.map((o) => (
            <Row
              key={o.id}
              label={`${o.kind} → ${o.recipient}`}
              value={o.status === 'pending' ? 'queued (not delivered)' : o.status}
            />
          ))
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-4 space-y-2">
      <h2 className="text-sm font-semibold text-fyh-text">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="truncate text-fyh-text">{label}</span>
      <span className="shrink-0 text-fyh-text-secondary">{value}</span>
    </div>
  );
}
