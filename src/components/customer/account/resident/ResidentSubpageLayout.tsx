import Link from 'next/link';
import type { ReactNode } from 'react';
import { ResidentControlShell } from '@/src/components/world/ResidentControlShell';

type Props = {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Consistent dark-glass shell for pay-rent, pay-electricity, history, vacating sub-routes. */
export function ResidentSubpageLayout({
  backHref,
  backLabel,
  title,
  subtitle,
  children,
}: Props) {
  return (
    <ResidentControlShell>
      <div className="apg-resident-subpage mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
        <header>
          <Link
            href={backHref}
            className="text-sm font-medium text-apg-cyan transition hover:text-apg-orange"
          >
            {backLabel}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-apg-silver">{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </ResidentControlShell>
  );
}

/** Inline sub-nav pills for Profile and Payments tabs. */
export function ResidentSubNav({
  items,
  activeId,
}: {
  items: { id: string; label: string; href: string }[];
  activeId: string;
}) {
  return (
    <nav
      className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
      aria-label="Section navigation"
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-medium transition ${
            activeId === item.id
              ? 'bg-apg-orange/15 text-apg-orange ring-1 ring-apg-orange/30'
              : 'text-apg-silver hover:bg-white/5 hover:text-white'
          }`}
          aria-current={activeId === item.id ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
