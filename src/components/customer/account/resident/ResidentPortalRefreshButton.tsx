'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type Props = {
  label?: string;
  className?: string;
};

/** Retries the failed server dependency via router.refresh — not a blind full reload. */
export function ResidentPortalRefreshButton({
  label = 'Try again',
  className = 'rounded-lg bg-apg-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-apg-orange/90',
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className={className}
    >
      {pending ? 'Retrying…' : label}
    </button>
  );
}
