import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  tone = 'dark',
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Admin shell is dark — use light text by default. */
  tone?: 'dark' | 'light';
}) {
  const titleClass = tone === 'dark' ? 'text-white' : 'text-zinc-900';
  const descClass = tone === 'dark' ? 'text-apg-silver' : 'text-zinc-500';
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className={`text-2xl font-semibold tracking-tight ${titleClass}`}>{title}</h1>
        {description ? (
          <p className={`mt-1 max-w-2xl text-sm ${descClass}`}>{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
