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
  depositDuePaise: number;
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
    <ApgCard tier="resident" className="!p-4 max-md:!p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-apg-silver">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums max-md:text-lg ${accent ? 'text-apg-orange' : 'text-white'}`}
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
  depositDuePaise,
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

  return (
    <div className="space-y-4 pb-2 max-md:space-y-3">
      <div className="grid gap-3 max-md:grid-cols-1 sm:grid-cols-3">
        <WalletMetricCard
          label="Security deposit held"
          value={paiseToInr(depositBalancePaise)}
          hint={
            depositDuePaise > 0
              ? `${paiseToInr(depositDuePaise)} still due — pay from Payments`
              : 'Held until checkout — not a bill'
          }
          accent={depositDuePaise > 0}
        />
        <WalletMetricCard
          label="Refundable at checkout"
          value={paiseToInr(availableRefundPaise)}
          hint="After notice and deductions"
        />
        <WalletMetricCard
          label="Referral earnings"
          value={paiseToInr(referralLocked + referralAvailable)}
          hint={
            referralAvailable > 0
              ? `${paiseToInr(referralAvailable)} withdrawable`
              : referralLocked > 0
                ? `${paiseToInr(referralLocked)} locked until move-out`
                : undefined
          }
          accent={referralAvailable > 0}
        />
      </div>

      {depositDuePaise > 0 ? (
        <ApgCard tier="resident">
          <h2 className="text-sm font-semibold text-white">Amount due</h2>
          <p className="mt-2 text-sm text-apg-silver">
            {paiseToInr(depositDuePaise)} security deposit is outstanding. Pay from the Payments
            tab when ready.
          </p>
        </ApgCard>
      ) : depositBalancePaise > 0 ? (
        <ApgCard tier="resident">
          <h2 className="text-sm font-semibold text-white">Security deposit held</h2>
          <p className="mt-2 text-sm text-apg-silver">
            {paiseToInr(depositBalancePaise)} is held until checkout. No payment is required right
            now.
          </p>
        </ApgCard>
      ) : null}

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
