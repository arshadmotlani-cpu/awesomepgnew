'use client';

export function ResidentProfilePageSkeleton() {
  return (
    <div className="animate-pulse space-y-6 pb-10" aria-busy aria-label="Loading resident profile">
      <div className="space-y-2">
        <div className="h-4 w-48 rounded bg-white/10" />
        <div className="h-8 w-64 rounded bg-white/10" />
        <div className="h-4 w-96 max-w-full rounded bg-white/5" />
      </div>
      <div className="rounded-xl border border-white/5 bg-[#1A1F27] p-5 space-y-4">
        <div className="h-5 w-40 rounded bg-white/10" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 rounded bg-white/5" />
              <div className="h-4 w-28 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/5 bg-[#1A1F27] p-5 space-y-3">
        <div className="h-5 w-36 rounded bg-white/10" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function CommandCenterTimelineSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-white/5 bg-[#1A1F27] p-5 space-y-4" aria-hidden>
      <div className="h-5 w-32 rounded bg-white/10" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-8 w-8 shrink-0 rounded-full bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-white/10" />
              <div className="h-3 w-full max-w-md rounded bg-white/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResidentBedTenancySkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-white/5 bg-[#1A1F27] p-5" aria-hidden>
      <div className="h-5 w-44 rounded bg-white/10" />
      <div className="h-10 w-full rounded-lg bg-white/10" />
      <div className="h-10 w-full rounded-lg bg-white/10" />
    </div>
  );
}

export function ResidentBookingDepositsSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-3 w-32 rounded bg-white/5" />
      <div className="h-24 w-full rounded-xl bg-white/5" />
    </div>
  );
}
