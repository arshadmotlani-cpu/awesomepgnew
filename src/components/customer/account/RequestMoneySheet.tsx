'use client';

import { useEffect, useState } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { DepositRefundRequestForm } from '@/src/components/customer/account/DepositRefundRequestForm';
import { ReferralWithdrawalForm } from '@/src/components/customer/account/ReferralWithdrawalForm';
import type { DepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';
import type { DepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import { primaryBtn } from '@/src/lib/design-system/tokens';
import { paiseToInr } from '@/src/lib/format';

type MoneyRequestKind = 'deposit_refund' | 'referral_withdrawal' | null;

export function RequestMoneySheet({
  bookingId,
  customerId,
  refundableBalancePaise,
  referralAvailablePaise,
  hasOpenVacating,
  settlementPreview = null,
  refundEligibility = null,
}: {
  bookingId: string;
  customerId: string;
  refundableBalancePaise: number;
  referralAvailablePaise: number;
  hasOpenVacating: boolean;
  settlementPreview?: DepositRefundSettlementPreview | null;
  refundEligibility?: DepositRefundEligibility | null;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MoneyRequestKind>(null);
  const canRequestRefund = refundEligibility?.canRequestRefund ?? refundableBalancePaise > 0;
  const refundLockReason = refundEligibility?.lockReason ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setKind(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <ApgCard tier="resident">
        <h3 className="text-sm font-semibold text-white">Request money</h3>
        <p className="mt-1 text-xs text-apg-silver">
          Deposit refunds and referral withdrawals use separate ledgers — choose the right request.
        </p>
        <button type="button" onClick={() => setOpen(true)} className={`${primaryBtn} mt-4 w-full`}>
          Request money
        </button>
      </ApgCard>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-money-title"
          onClick={() => {
            setOpen(false);
            setKind(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {kind === null ? (
              <>
                <h2 id="request-money-title" className="text-lg font-semibold text-white">
                  What do you want?
                </h2>
                <p className="mt-1 text-xs text-apg-silver">Select one — workflows stay separate.</p>
                <div className="mt-5 space-y-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 hover:border-apg-orange/40">
                    <input
                      type="radio"
                      name="moneyKind"
                      className="mt-1 accent-[#FF5A1F]"
                      onChange={() => setKind('deposit_refund')}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-white">Deposit refund</span>
                      <span className="mt-0.5 block text-xs text-apg-silver">
                        Refundable deposit · {paiseToInr(refundableBalancePaise)} available
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4 hover:border-apg-orange/40">
                    <input
                      type="radio"
                      name="moneyKind"
                      className="mt-1 accent-[#FF5A1F]"
                      onChange={() => setKind('referral_withdrawal')}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-white">Referral withdrawal</span>
                      <span className="mt-0.5 block text-xs text-apg-silver">
                        Referral earnings · {paiseToInr(referralAvailablePaise)} withdrawable
                      </span>
                    </span>
                  </label>
                </div>
                <button
                  type="button"
                  className="mt-5 w-full rounded-xl border border-white/15 py-2.5 text-sm text-apg-silver hover:text-white"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </>
            ) : kind === 'deposit_refund' ? (
              <>
                <button
                  type="button"
                  className="text-xs text-apg-silver hover:text-white"
                  onClick={() => setKind(null)}
                >
                  ← Back
                </button>
                {hasOpenVacating ? (
                  <p className="mt-3 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                    You have a vacating notice on file. After checkout, submit your deposit refund with
                    meter photo and UPI details.
                  </p>
                ) : null}
                {refundableBalancePaise <= 0 ? (
                  <p className="mt-3 text-sm text-amber-200">No refundable deposit balance on file.</p>
                ) : !canRequestRefund && refundLockReason ? (
                  <p className="mt-3 text-sm text-amber-200">{refundLockReason}</p>
                ) : (
                  <DepositRefundRequestForm
                    bookingId={bookingId}
                    customerId={customerId}
                    refundableBalancePaise={refundableBalancePaise}
                    settlementPreview={settlementPreview}
                    onSubmitted={() => {
                      setOpen(false);
                      setKind(null);
                    }}
                  />
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="text-xs text-apg-silver hover:text-white"
                  onClick={() => setKind(null)}
                >
                  ← Back
                </button>
                <ReferralWithdrawalForm
                  customerId={customerId}
                  availablePaise={referralAvailablePaise}
                  onSubmitted={() => {
                    setOpen(false);
                    setKind(null);
                  }}
                />
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
