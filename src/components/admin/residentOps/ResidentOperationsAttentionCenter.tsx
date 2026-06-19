'use client';

import Link from 'next/link';
import type { AttentionBucket, AttentionBucketId } from '@/src/lib/residents/residentOperationsDashboard';

const BUCKET_ACCENT: Partial<Record<AttentionBucketId, string>> = {
  rent_overdue: 'border-rose-400/40 bg-rose-500/10 hover:bg-rose-500/15',
  payment_proof: 'border-amber-400/35 bg-amber-500/10 hover:bg-amber-500/15',
  kyc_pending: 'border-sky-400/35 bg-sky-500/10 hover:bg-sky-500/15',
  bed_unassigned: 'border-violet-400/35 bg-violet-500/10 hover:bg-violet-500/15',
  move_out: 'border-orange-400/35 bg-orange-500/10 hover:bg-orange-500/15',
  deposit_refund: 'border-emerald-400/35 bg-emerald-500/10 hover:bg-emerald-500/15',
  requests_pending: 'border-white/20 bg-white/[0.04] hover:bg-white/[0.07]',
};

export function ResidentOperationsAttentionCenter({
  buckets,
  activeFilter,
}: {
  buckets: AttentionBucket[];
  activeFilter: AttentionBucketId | null;
}) {
  return (
    <section className="mb-8" id="attention">
      <header className="mb-4">
        <h2 className="text-xl font-bold text-white">Attention command center</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Which residents need you right now — tap a bucket to filter the queue below.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {buckets.map((bucket) => {
          const isActive = activeFilter === bucket.id;
          const href = bucket.count > 0 ? `?filter=${bucket.id}#queue` : undefined;
          const accent = BUCKET_ACCENT[bucket.id] ?? 'border-white/15 bg-white/[0.03] hover:bg-white/[0.06]';
          const inner = (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wide text-apg-silver">
                {bucket.label}
              </p>
              <p
                className={
                  'mt-2 text-3xl font-bold tabular-nums ' +
                  (bucket.count > 0 ? 'text-white' : 'text-apg-silver/60')
                }
              >
                {bucket.count}
              </p>
            </>
          );

          if (!href) {
            return (
              <div
                key={bucket.id}
                className={`rounded-xl border px-4 py-3 opacity-60 ${accent}`}
              >
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={bucket.id}
              href={href}
              className={
                'rounded-xl border px-4 py-3 transition ' +
                accent +
                (isActive ? ' ring-2 ring-[#FF5A1F]' : '')
              }
            >
              {inner}
            </Link>
          );
        })}
      </div>
      {activeFilter ? (
        <p className="mt-3 text-xs text-apg-silver">
          Showing{' '}
          <span className="font-medium text-white">
            {buckets.find((b) => b.id === activeFilter)?.label}
          </span>
          .{' '}
          <Link href="/admin/operations#queue" className="text-[#FF5A1F] hover:underline">
            Clear filter
          </Link>
        </p>
      ) : null}
    </section>
  );
}
