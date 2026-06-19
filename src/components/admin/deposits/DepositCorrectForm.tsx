'use client';

import { editDepositSummaryFormAction } from '@/app/(admin)/admin/deposits/deposit-wallet-actions';
import {
  sanitizeUnifiedDepositView,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { asPlainNumber } from '@/src/lib/format';

export function DepositCorrectForm({
  view,
  saved,
  errorMessage,
}: {
  view?: Partial<UnifiedDepositView> | null;
  saved?: boolean;
  errorMessage?: string | null;
}) {
  const v = sanitizeUnifiedDepositView(view);

  if (!view || !v.bookingId) {
    return (
      <div className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5 text-apg-silver shadow-none">
        <p className="text-sm text-white">Deposit data unavailable.</p>
        <p className="mt-1 text-xs text-apg-silver">Reload the page to refresh deposit details.</p>
      </div>
    );
  }

  const requiredPlaceholder = (asPlainNumber(v.requiredPaise) / 100).toString();
  const collectedPlaceholder = (asPlainNumber(v.collectedPaise) / 100).toString();

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5">
      <h2 className="text-sm font-semibold text-white">Correct deposit</h2>
      <p className="mt-1 text-xs text-apg-silver">
        Update the required or collected deposit amount when records need fixing.
      </p>

      {saved ? (
        <p className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Deposit summary updated everywhere.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {errorMessage}
        </p>
      ) : null}

      <form
        action={editDepositSummaryFormAction}
        className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-[#12161C] p-4 sm:grid-cols-2"
      >
        <input type="hidden" name="bookingId" value={v.bookingId} />
        <label className="text-sm">
          <span className="text-apg-silver">Required deposit (₹)</span>
          <input
            name="requiredInr"
            type="number"
            min="0"
            step="1"
            placeholder={requiredPlaceholder}
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-apg-silver">Collected deposit (₹)</span>
          <input
            name="collectedInr"
            type="number"
            min="0"
            step="1"
            placeholder={collectedPlaceholder}
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <label className="sm:col-span-2 text-sm">
          <span className="text-apg-silver">Reason</span>
          <input
            name="reason"
            required
            placeholder="Why are you correcting this deposit?"
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Save corrections
          </button>
        </div>
      </form>
    </section>
  );
}
