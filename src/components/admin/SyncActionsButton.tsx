'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncOverviewAction } from '@/app/(admin)/admin/overview/actions';

export function SyncActionsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await syncOverviewAction();
          router.refresh();
        });
      }}
      className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#e54f1a] disabled:opacity-50"
    >
      {pending ? 'Syncing…' : 'Sync now'}
    </button>
  );
}
