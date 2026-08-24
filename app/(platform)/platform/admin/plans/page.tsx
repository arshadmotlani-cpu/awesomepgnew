import { savePlanAction } from '@/src/platform/actions/admin';
import { PageHeader } from '@/src/platform/components/ui/PageHeader';
import { DataTable } from '@/src/platform/components/ui/DataTable';
import { listPlatformPlans } from '@/src/platform/services/admin';
import {
  formatInrFromPaise,
  resolveListPricePaiseFromPlanLimits,
} from '@/src/platform/lib/salonSubscriptionPricing';
import { resolveAmountPaiseFromPlanLimits, resolveBillingIntervalFromPlanLimits } from '@/src/platform/services/manualSubscriptionPayments';

function formatLimits(limits: Record<string, unknown>): string {
  const users = limits.users;
  const locations = limits.locations;
  const parts: string[] = [];
  if (typeof locations === 'number') parts.push(`${locations} loc`);
  if (typeof users === 'number') parts.push(`${users} users`);
  try {
    const amount = resolveAmountPaiseFromPlanLimits(limits);
    const interval = resolveBillingIntervalFromPlanLimits(limits);
    parts.push(`${formatInrFromPaise(amount)}/${interval === 'year' ? 'yr' : 'mo'}`);
  } catch {
    const price = limits.priceMonthly ?? limits.price;
    if (typeof price === 'number') parts.push(`₹${price}/mo`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'See JSON';
}

function formatPlanPrice(limits: Record<string, unknown>): string {
  try {
    const amount = resolveAmountPaiseFromPlanLimits(limits);
    const list = resolveListPricePaiseFromPlanLimits(limits);
    const interval = resolveBillingIntervalFromPlanLimits(limits);
    const suffix = interval === 'year' ? '/yr' : '/mo';
    if (list && list > amount) {
      return `${formatInrFromPaise(list)} → ${formatInrFromPaise(amount)}${suffix}`;
    }
    return `${formatInrFromPaise(amount)}${suffix}`;
  } catch {
    const price = limits.priceMonthly ?? limits.price;
    return typeof price === 'number' ? `₹${price}/mo` : 'Not configured';
  }
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default async function PlatformPlansPage() {
  const plans = await listPlatformPlans();

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="SaaS plan catalog and entitlement limits."
      />

      <form
        action={savePlanAction}
        className="mb-6 rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-5 max-w-xl"
      >
        <h2 className="text-sm font-semibold mb-3">Create plan</h2>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--plt-text-muted)]">Slug</span>
            <input name="slug" required className="plt-input" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--plt-text-muted)]">Name</span>
            <input name="name" required className="plt-input" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-[var(--plt-text-muted)]">Limits JSON</span>
            <textarea
              name="limitsJson"
              rows={5}
              defaultValue={'{\n  "users": 10,\n  "locations": 1\n}'}
              className="plt-input font-mono text-xs"
            />
          </label>
          <button type="submit" className="plt-btn-primary w-fit">Save plan</button>
        </div>
      </form>

      <DataTable
        rows={plans}
        getRowKey={(row) => row.id}
        emptyMessage="No plans configured."
        columns={[
          { key: 'name', header: 'Name', cell: (row) => row.name },
          { key: 'slug', header: 'Slug', cell: (row) => row.slug },
          {
            key: 'limits',
            header: 'Included',
            cell: (row) => formatLimits((row.limits as Record<string, unknown>) ?? {}),
          },
          {
            key: 'price',
            header: 'Price',
            cell: (row) => formatPlanPrice((row.limits as Record<string, unknown>) ?? {}),
          },
          { key: 'created', header: 'Created', cell: (row) => formatDate(row.createdAt) },
          {
            key: 'edit',
            header: '',
            cell: (row) => (
              <details>
                <summary className="text-xs text-[var(--plt-accent)] cursor-pointer hover:underline">
                  Edit
                </summary>
                <form action={savePlanAction} className="mt-3 grid gap-2 p-3 border border-[var(--plt-border)] rounded-md">
                  <input type="hidden" name="id" value={row.id} />
                  <input name="slug" defaultValue={row.slug} className="plt-input text-xs" />
                  <input name="name" defaultValue={row.name} className="plt-input text-xs" />
                  <textarea
                    name="limitsJson"
                    rows={4}
                    defaultValue={JSON.stringify(row.limits ?? {}, null, 2)}
                    className="plt-input font-mono text-xs"
                  />
                  <button type="submit" className="plt-btn-secondary text-xs">Update</button>
                </form>
              </details>
            ),
          },
        ]}
      />
    </>
  );
}
