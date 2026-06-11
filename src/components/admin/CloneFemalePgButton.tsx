'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clonePgAsFemaleAction } from '@/app/(admin)/admin/pgs/actions';

export function CloneFemalePgButton({
  pgId,
  pgName,
  genderPolicy,
}: {
  pgId: string;
  pgName: string;
  genderPolicy: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (genderPolicy === 'female') return null;

  async function onClick() {
    const confirmed = window.confirm(
      `Create a copy of "${pgName}" with the same rooms, beds, rent, and QR setup — but women-only?`,
    );
    if (!confirmed) return;
    setPending(true);
    const result = await clonePgAsFemaleAction(pgId);
    setPending(false);
    if (!result.ok || !result.newPgId) {
      window.alert(result.error ?? 'Failed to duplicate PG.');
      return;
    }
    router.push(`/admin/pgs/${result.newPgId}/edit?created=1`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? 'Duplicating…' : 'Duplicate as women-only PG'}
    </button>
  );
}
