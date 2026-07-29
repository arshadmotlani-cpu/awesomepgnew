import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { FyhCustomer } from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';

export function CustomersList({
  customers,
  q,
}: {
  customers: FyhCustomer[];
  q?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">
            CRM
          </p>
          <h1 className="fyh-display mt-1 text-3xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-fyh-text-secondary">
            Search by name, phone, WhatsApp, or email
          </p>
        </div>
        <Link href="/customers/new">
          <Button type="button">
            <Plus className="mr-2 h-4 w-4" />
            Add customer
          </Button>
        </Link>
      </div>

      <form className="fyh-glass flex flex-wrap items-center gap-3 p-3" method="get">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fyh-text-muted" />
          <Input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Name, phone, WhatsApp, or email"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="fyh-glass overflow-hidden">
        {customers.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="fyh-display text-xl font-semibold">No customers yet</p>
            <p className="mt-2 text-sm text-fyh-text-muted">
              Add your first guest to unlock appointments and billing.
            </p>
            <Link href="/customers/new" className="mt-6 inline-block">
              <Button type="button">Add customer</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {customers.map((c) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}`}
                  className="fyh-glass block space-y-2 p-4 transition hover:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{c.fullName}</p>
                      <p className="mt-0.5 text-xs text-fyh-text-muted tabular-nums">{c.phone}</p>
                    </div>
                    <span className="tabular-nums text-fyh-accent">
                      {formatInrFromPaise(c.lifetimeSpendPaise ?? 0)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-fyh-text-muted">
                    <span>{c.totalVisits ?? 0} visits</span>
                    {c.email ? (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[12rem]">{c.email}</span>
                      </>
                    ) : null}
                    {(c.tags ?? []).length ? (
                      <>
                        <span>·</span>
                        <span>{(c.tags ?? []).slice(0, 2).join(', ')}</span>
                      </>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
            <div className="fyh-glass hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-[color:var(--fyh-border)] bg-black/20 text-xs uppercase tracking-wide text-fyh-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">WhatsApp</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Visits</th>
                  <th className="px-4 py-3 font-medium">Lifetime</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--fyh-border)]">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium text-fyh-text hover:text-fyh-accent"
                      >
                        {c.fullName}
                      </Link>
                      {c.importantAlerts ? (
                        <p className="mt-0.5 text-[11px] text-fyh-danger">Alert on file</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fyh-text-secondary">{c.phone}</td>
                    <td className="px-4 py-3 tabular-nums text-fyh-text-muted">
                      {c.whatsapp || '—'}
                    </td>
                    <td className="px-4 py-3 text-fyh-text-muted">{c.email || '—'}</td>
                    <td className="px-4 py-3 tabular-nums">{c.totalVisits ?? 0}</td>
                    <td className="px-4 py-3 tabular-nums text-fyh-accent">
                      {formatInrFromPaise(c.lifetimeSpendPaise ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-fyh-text-muted">
                      {(c.tags ?? []).slice(0, 3).join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
