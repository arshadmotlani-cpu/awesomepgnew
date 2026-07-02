import type { ReactNode } from 'react';

const SECTION =
  'scroll-mt-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-4 sm:p-5';

export function CommandCenterSection({
  id,
  title,
  description,
  children,
  badge,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <section id={id} className={SECTION}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-apg-silver">{description}</p>
          ) : null}
        </div>
        {badge}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function WorkflowButton({ href, label = 'Go to workflow' }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      className="inline-flex shrink-0 items-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
    >
      {label}
    </a>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-apg-silver">{children}</p>;
}
