'use client';

import { useTransition } from 'react';
import type { ImpersonationContext } from '@/src/lib/auth/impersonation';

type Props = {
  context: ImpersonationContext;
};

function formatClock(date: Date): string {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ImpersonationBanner({ context }: Props) {
  const [pending, startTransition] = useTransition();

  function handleReturn() {
    startTransition(async () => {
      const res = await fetch('/api/admin/impersonation/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exitReason: 'admin_return' }),
      });
      const data = (await res.json()) as { ok?: boolean; redirectTo?: string };
      if (data.ok && data.redirectTo) {
        window.location.href = data.redirectTo;
      }
    });
  }

  const tenancyParts = [
    context.bookingCode ? `Booking ${context.bookingCode}` : null,
    context.pgName,
    context.roomNumber ? `Room ${context.roomNumber}` : null,
    context.bedCode ? `Bed ${context.bedCode}` : null,
  ].filter(Boolean);

  return (
    <div
      className="border-b border-amber-400/40 bg-amber-500/15 px-4 py-3 text-sm text-amber-50"
      data-testid="impersonation-banner"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">
            Viewing as Resident
          </p>
          <p className="font-semibold text-white">
            {context.residentName}
            <span className="ml-2 font-normal text-amber-100/90">{context.residentPhone}</span>
          </p>
          {tenancyParts.length > 0 ? (
            <p className="text-xs text-amber-100/80">{tenancyParts.join(' · ')}</p>
          ) : null}
          <p className="text-xs text-amber-100/70">
            Admin {context.adminName} · Started {formatClock(context.startedAt)} · Reason{' '}
            {context.reason}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReturn}
          disabled={pending}
          className="shrink-0 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
        >
          {pending ? 'Returning…' : 'Return to Admin'}
        </button>
      </div>
    </div>
  );
}
