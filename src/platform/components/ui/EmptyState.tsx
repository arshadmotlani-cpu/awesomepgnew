import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
};

export function EmptyState({ title, description, action, actionHref, actionLabel }: Props) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--plt-border)] bg-[var(--plt-bg-surface)] px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--plt-text)]">{title}</p>
      {description ? (
        <p className="mt-1 text-sm text-[var(--plt-text-muted)] max-w-md mx-auto">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="plt-btn-primary mt-4 inline-flex">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
