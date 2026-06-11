'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { archiveResidentAction } from '@/app/(admin)/admin/residents/[customerId]/actions';

export function ArchiveResidentButton({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onArchive() {
    if (
      !window.confirm(
        `Remove ${customerName} from the residents list? They must have no active bed assignment. Their account login still works if they signed up.`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await archiveResidentAction(customerId);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not remove resident.');
      return;
    }
    router.push('/admin/residents');
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void onArchive()}
        className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
      >
        {pending ? 'Removing…' : 'Remove from residents list'}
      </button>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
