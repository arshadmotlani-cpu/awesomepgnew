'use client';

import {
  sanitizeUnifiedDepositView,
  type UnifiedDepositView,
} from '@/src/lib/deposits/unifiedDepositView';
import { asPlainNumber } from '@/src/lib/format';
import { DepositDetailSection } from '@/src/components/admin/deposits/DepositDetailSection';
import { adminMoneyInputClassName, bindAdminMoneyInput } from '@/src/components/admin/AdminMoneyInput';

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
      <DepositDetailSection title="Correct deposit" description="Deposit data could not be loaded.">
        <div className="rounded-2xl border border-white/10 bg-[#1A1F27] p-5 text-apg-silver">
          <p className="text-sm text-white">Deposit data unavailable.</p>
          <p className="mt-1 text-xs">Reload the page to try again.</p>
        </div>
      </DepositDetailSection>
    );
  }

  const requiredPlaceholder = (asPlainNumber(v.requiredPaise) / 100).toString();
  const collectedPlaceholder = (asPlainNumber(v.collectedPaise) / 100).toString();

  return (
    <DepositDetailSection
      id="correct-deposit"
      title="Correct deposit"
      description="Fix the required or collected amount when records are wrong. You must enter a reason."
    >
      {saved ? (
        <p className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Changes saved. Totals are updated across billing and deposits.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mb-4 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {errorMessage}
        </p>
      ) : null}

      <form
        action={`/api/admin/deposits/${v.bookingId}/correct-summary`}
        method="POST"
        className="grid gap-4 rounded-2xl border border-white/10 bg-[#1A1F27] p-5 sm:grid-cols-2"
      >
        <input type="hidden" name="bookingId" value={v.bookingId} />
        <label className="text-sm">
          <span className="text-apg-silver">Required deposit (₹)</span>
          <input
            {...bindAdminMoneyInput()}
            name="requiredInr"
            placeholder={requiredPlaceholder}
            className={`apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white ${adminMoneyInputClassName}`}
          />
        </label>
        <label className="text-sm">
          <span className="text-apg-silver">Collected deposit (₹)</span>
          <input
            {...bindAdminMoneyInput()}
            name="collectedInr"
            placeholder={collectedPlaceholder}
            className={`apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white ${adminMoneyInputClassName}`}
          />
        </label>
        <label className="sm:col-span-2 text-sm">
          <span className="text-apg-silver">Reason</span>
          <input
            name="reason"
            required
            placeholder="Why are you changing this deposit?"
            className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F14] px-3 py-2 text-white"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Save changes
          </button>
        </div>
      </form>
    </DepositDetailSection>
  );
}
