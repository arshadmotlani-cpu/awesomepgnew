import Link from 'next/link';
import { ReactNode } from 'react';
import { platformLogoutAction } from '@/src/platform/actions/auth';

const NAV_ITEMS = [
  { href: '/platform/admin', label: 'Overview' },
  { href: '/platform/admin/organizations', label: 'Organizations' },
  { href: '/platform/admin/plans', label: 'Plans' },
  { href: '/platform/admin/subscriptions', label: 'Subscriptions' },
  { href: '/platform/admin/users', label: 'Users' },
];

export function PlatformAdminShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/70">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">FYHAIR SaaS</p>
              <h1 className="text-lg font-semibold">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <Link href="/platform/dashboard" className="text-sm text-slate-400 hover:text-white">
                User dashboard
              </Link>
              <form action={platformLogoutAction}>
                <button
                  type="submit"
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          <nav className="mt-4 flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}

export function AdminCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <p className="text-sm text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
