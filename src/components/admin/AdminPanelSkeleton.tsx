'use client';

export function AdminDrawerSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="flex gap-2">
        <div className="h-9 w-32 rounded-lg bg-white/10" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-white/5 bg-[#1A1F27] px-4 py-3">
            <div className="space-y-2">
              <div className="h-4 w-40 rounded bg-white/10" />
              <div className="h-3 w-24 rounded bg-white/5" />
            </div>
            <div className="h-4 w-16 rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminActionDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-4 w-24 rounded bg-white/10" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-16 rounded bg-white/5" />
            <div className="h-4 w-full rounded bg-white/10" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 rounded bg-white/10" />
        <div className="h-10 w-full rounded-lg bg-white/10" />
        <div className="h-10 w-full rounded-lg bg-white/10" />
      </div>
    </div>
  );
}
