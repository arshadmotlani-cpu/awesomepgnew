import Link from 'next/link';
import type { ReactNode } from 'react';

type Breadcrumb = { label: string; href?: string };

type Props = {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  action?: ReactNode;
};

export function PageHeader({ title, subtitle, breadcrumbs, action }: Props) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--plt-text-subtle)]">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-[var(--plt-text-muted)]">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
                {i < breadcrumbs.length - 1 ? <span>/</span> : null}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-xl font-semibold tracking-tight text-[var(--plt-text)]">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-[var(--plt-text-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
