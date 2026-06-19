'use client';

import Link from 'next/link';
import type { AttentionBucket, AttentionBucketId } from '@/src/lib/residents/residentOperationsDashboard';
import {
  BUCKET_ICONS,
  IconChevronRight,
  OPS_ORANGE,
  OpsSection,
} from '@/src/components/admin/residentOps/residentOpsUi';

export function ResidentOperationsAttentionCenter({
  buckets,
  activeFilter,
}: {
  buckets: AttentionBucket[];
  activeFilter: AttentionBucketId | null;
}) {
  return (
    <OpsSection
      id="attention"
      title="Attention command center"
      description="Which residents need you right now — tap a bucket to filter the queue below."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {buckets.map((bucket) => {
          const isActive = activeFilter === bucket.id;
          const hasItems = bucket.count > 0;
          const href = hasItems ? `?filter=${bucket.id}#queue` : undefined;
          const Icon = BUCKET_ICONS[bucket.id];

          const cardInner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#FF5A1F]/15 text-[#FF5A1F]"
                  aria-hidden
                >
                  <Icon width={18} height={18} />
                </span>
                {hasItems ? (
                  <IconChevronRight className="mt-1 shrink-0 text-apg-silver/50" />
                ) : null}
              </div>
              <p className="mt-4 text-[11px] font-medium leading-snug text-apg-silver">
                {bucket.label}
              </p>
              <p
                className={
                  'mt-2 text-3xl font-bold tabular-nums tracking-tight ' +
                  (hasItems ? 'text-[#FF5A1F]' : 'text-apg-silver/40')
                }
              >
                {bucket.count}
              </p>
            </>
          );

          const cardClass =
            'relative flex min-h-[132px] flex-col rounded-2xl border px-4 py-4 transition ' +
            (hasItems
              ? 'border-white/12 bg-[#1A1F27] hover:border-[#FF5A1F]/35 hover:bg-[#1F2630] hover:shadow-[0_8px_28px_rgba(255,90,31,0.12)]'
              : 'border-white/8 bg-[#161b22] opacity-70') +
            (isActive ? ' ring-2 ring-[#FF5A1F] ring-offset-2 ring-offset-[#121820]' : '');

          if (!href) {
            return (
              <div key={bucket.id} className={cardClass}>
                {cardInner}
              </div>
            );
          }

          return (
            <Link key={bucket.id} href={href} className={cardClass}>
              {cardInner}
            </Link>
          );
        })}
      </div>

      {activeFilter ? (
        <p className="mt-4 text-xs text-apg-silver">
          Showing{' '}
          <span className="font-semibold text-white">
            {buckets.find((b) => b.id === activeFilter)?.label}
          </span>
          .{' '}
          <Link href="/admin/operations#queue" className="font-medium hover:underline" style={{ color: OPS_ORANGE }}>
            Clear filter
          </Link>
        </p>
      ) : null}
    </OpsSection>
  );
}
