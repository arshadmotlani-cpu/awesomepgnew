'use client';

export function ResidentPortalPageSkeleton() {
  return (
    <div className="animate-pulse space-y-6 pb-10" aria-busy aria-label="Loading your account">
      <div className="h-8 w-48 rounded bg-white/10" />
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 shrink-0 rounded-full bg-white/10" />
        ))}
      </div>
      <div className="rounded-xl border border-white/5 bg-[#1A1F27] p-5 space-y-4">
        <div className="h-5 w-40 rounded bg-white/10" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResidentProfileTabSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="h-32 rounded-xl bg-white/5" />
      <div className="h-48 rounded-xl bg-white/5" />
    </div>
  );
}

export function ResidentPaymentsTabSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-10 w-full rounded-lg bg-white/10" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl bg-white/5" />
      ))}
    </div>
  );
}

export function ResidentRequestsTabSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-12 rounded-xl bg-white/5" />
      <div className="h-40 rounded-xl bg-white/5" />
    </div>
  );
}

export function ResidentReferralsTabSkeleton() {
  return (
    <div className="animate-pulse h-36 rounded-xl bg-white/5" aria-hidden />
  );
}

export function ResidentConciergeTabSkeleton() {
  return (
    <div className="animate-pulse h-64 rounded-xl bg-white/5" aria-hidden />
  );
}
