import { ResidentPortalRefreshButton } from '@/src/components/customer/account/resident/ResidentPortalRefreshButton';

/** Shown only when core resident context cannot be resolved — not for incomplete onboarding. */
export function ResidentPortalCoreErrorPanel() {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-5">
      <p className="text-sm font-semibold text-rose-900">We couldn&apos;t load your account right now</p>
      <p className="mt-2 text-sm text-rose-800">
        Something went wrong while opening your resident portal. Your booking and deposit are safe —
        please try again. If the problem continues, contact the PG office with a screenshot.
      </p>
      <ResidentPortalRefreshButton
        className="mt-4 rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-600"
      />
    </div>
  );
}
