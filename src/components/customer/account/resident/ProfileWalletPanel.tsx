'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { RequestMoneySheet } from '@/src/components/customer/account/RequestMoneySheet';
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

function WalletMetricCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <ApgCard tier="resident" className="!p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-silver">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${accent ? 'text-apg-orange' : 'text-white'}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-apg-silver">{hint}</p> : null}
    </ApgCard>
  );
}

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
    <ApgCard tier="resident">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-apg-silver">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-apg-silver">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
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
    </ApgCard>
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
  const referralWithdrawn = referralSummary?.withdrawnPaise ?? 0;
  const referralTotal = referralLocked + referralAvailable + referralWithdrawn;
  const walletTotalPaise = depositBalancePaise + referralTotal;

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="resident">
        <p className="text-xs font-semibold uppercase tracking-wider text-apg-orange">Total wallet</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-white">{paiseToInr(walletTotalPaise)}</p>
        <p className="mt-1 text-xs text-apg-silver">
          Deposit {paiseToInr(depositBalancePaise)} · Referral {paiseToInr(referralTotal)}
        </p>
      </ApgCard>

      <div className="grid gap-3 sm:grid-cols-2">
        <WalletMetricCard label="Deposit balance" value={paiseToInr(depositBalancePaise)} />
        <WalletMetricCard
          label="Deposit refundable"
          value={paiseToInr(availableRefundPaise)}
          accent
        />
        <WalletMetricCard label="Referral earnings" value={paiseToInr(referralLocked + referralAvailable)} />
        <WalletMetricCard label="Pending earnings" value={paiseToInr(referralLocked)} hint="Locked until move-out" />
        <WalletMetricCard
          label="Withdrawable referral"
          value={paiseToInr(referralAvailable)}
          accent={referralAvailable > 0}
        />
        <WalletMetricCard label="Withdrawn referral" value={paiseToInr(referralWithdrawn)} />
      </div>

      <ApgCard tier="resident">
        <h2 className="text-sm font-semibold text-white">Deposit details</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-apg-silver">Paid</dt>
            <dd className="text-sm font-semibold text-white">{paiseToInr(depositPaidPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Due</dt>
            <dd className="text-sm font-semibold text-white">{paiseToInr(depositDuePaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-apg-silver">Required</dt>
            <dd className="text-sm font-semibold text-white">{paiseToInr(depositRequiredPaise)}</dd>
          </div>
        </dl>
      </ApgCard>

      {!refundEligibility.canRequestRefund && refundEligibility.lockReason ? (
        <ApgCard tier="resident">
          <p className="text-sm text-amber-200">
            <span className="font-semibold text-white">Deposit refund not available yet.</span>{' '}
            {refundEligibility.lockReason}
          </p>
        </ApgCard>
      ) : null}

      <RequestMoneySheet
        bookingId={bookingId}
        customerId={customerId}
        refundableBalancePaise={availableRefundPaise}
        referralAvailablePaise={referralAvailable}
        hasOpenVacating={hasOpenVacating}
        settlementPreview={settlementPreview}
        refundEligibility={refundEligibility}
      />

      <LedgerSection title="Deposit deductions" rows={deductions} empty="No deductions yet." />
      <LedgerSection title="Refund history" rows={refunds} empty="No refunds processed yet." />
    </div>
  );
}
