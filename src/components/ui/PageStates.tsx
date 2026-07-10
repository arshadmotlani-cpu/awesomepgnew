import type { ReactNode } from 'react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center p-6 text-sm text-zinc-500">
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-8 text-center dark:border-white/10 dark:bg-white/5">
      <p className="text-sm font-medium text-zinc-900 dark:text-white">{title}</p>
      {description ? <p className="mt-2 text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/40 dark:bg-rose-950/30">
      <p className="text-sm font-medium text-rose-900 dark:text-rose-100">{title}</p>
      <p className="mt-2 text-sm text-rose-700 dark:text-rose-200">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function OfflineRetry({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title="You appear to be offline"
      description="Check your connection and try again."
      onRetry={onRetry}
    />
  );
}
