'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { ResidentRequestForms } from '@/src/components/customer/account/ResidentRequestForms';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { DepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import type { DepositLedgerEntry } from '@/src/db/schema/depositLedger';
import type { DepositRefundSettlementPreview } from '@/src/lib/deposits/depositRefundSettlementPreview';

type ReferralSummary = {
  lockedPaise: number;
  availablePaise: number;
  withdrawnPaise: number;
};

type Props = {
  bookingId: string;
  customerId: string;
  depositBalancePaise: number;
  depositPaidPaise: number;
  depositDuePaise: number;
  depositRequiredPaise: number;
  availableRefundPaise: number;
  entries: DepositLedgerEntry[];
  hasOpenVacating: boolean;
  refundEligibility: DepositRefundEligibility;
  settlementPreview: DepositRefundSettlementPreview | null;
  referralSummary?: ReferralSummary;
};

function LedgerSection({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; amount: string; tone?: 'deduction' | 'credit' }[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-apg-silver">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-apg-silver">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li
              key={`${title}-${row.label}`}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="text-apg-silver">{row.label}</span>
              <span
                className={`tabular-nums font-medium ${
                  row.tone === 'deduction'
                    ? 'text-rose-300'
                    : row.tone === 'credit'
                      ? 'text-emerald-300'
                      : 'text-white'
                }`}
              >
                {row.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProfileWalletPanel({
  bookingId,
  customerId,
  depositBalancePaise,
  depositPaidPaise,
  depositDuePaise,
  depositRequiredPaise,
  availableRefundPaise,
  entries,
  hasOpenVacating,
  refundEligibility,
  settlementPreview,
  referralSummary,
}: Props) {
  const deductions = entries
    .filter((e) => e.entryKind === 'deducted')
    .map((e) => ({
      label: e.reason ?? 'Deduction',
      amount: `−${paiseToInr(e.amountPaise)}`,
      tone: 'deduction' as const,
    }));

  const refunds = entries
    .filter((e) => e.entryKind === 'refunded')
    .map((e) => ({
      label: `${e.reason ?? 'Refund'}${e.createdAt ? ` · ${formatDate(e.createdAt)}` : ''}`,
      amount: paiseToInr(Math.abs(e.amountPaise)),
      tone: 'credit' as const,
    }));

  const referralLocked = referralSummary?.lockedPaise ?? 0;
  const referralAvailable = referralSummary?.availablePaise ?? 0;

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="resident">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-apg-silver">
              Available refund
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-apg-orange">
              {paiseToInr(availableRefundPaise)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-apg-silver">
              Deposit balance
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-white">
              {paiseToInr(depositBalancePaise)}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-apg-silver">Deposit paid</dt>
            <dd className="text-sm font-semibold text-white">{paiseToInr(depositPaidPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Deposit due</dt>
            <dd className="text-sm font-semibold text-white">{paiseToInr(depositDuePaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Deposit required</dt>
            <dd className="text-sm font-semibold text-white">{paiseToInr(depositRequiredPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Referral earnings</dt>
            <dd className="text-sm font-semibold text-white">
              {paiseToInr(referralLocked + referralAvailable)}
              {referralLocked > 0 ? (
                <span className="ml-1 text-xs font-normal text-apg-silver">
                  (₹{Math.round(referralLocked / 100)} locked until move-out)
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </ApgCard>

      <ApgCard tier="resident" className="space-y-4">
        <LedgerSection title="Deposit deductions" rows={deductions} empty="No deductions yet." />
        <LedgerSection title="Refund history" rows={refunds} empty="No refunds processed yet." />
      </ApgCard>

      {!refundEligibility.canRequestRefund && refundEligibility.lockReason ? (
        <ApgCard tier="resident">
          <p className="text-sm text-amber-200">
            <span className="font-semibold text-white">Refund not available yet.</span>{' '}
            {refundEligibility.lockReason}
          </p>
        </ApgCard>
      ) : null}

      <ResidentRequestForms
        bookingId={bookingId}
        customerId={customerId}
        refundableBalancePaise={availableRefundPaise}
        hasOpenVacating={hasOpenVacating}
        settlementPreview={settlementPreview}
        refundEligibility={refundEligibility}
      />
    </div>
  );
}
