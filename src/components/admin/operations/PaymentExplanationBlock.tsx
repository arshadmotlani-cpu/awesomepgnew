'use client';

import { useState, type ReactNode } from 'react';
import { paiseToInr } from '@/src/lib/format';
import type { PaymentExplanationView } from '@/src/lib/operations/paymentExplanationView';

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">{children}</p>
  );
}

function MoneyLine({
  line,
  strong = false,
}: {
  line: {
    label: string;
    amountPaise: number;
    bookingCode?: string | null;
    statusLabel?: string;
    amountPrefix?: string;
    isDeduction?: boolean;
  };
  strong?: boolean;
}) {
  const prefix = line.amountPrefix ?? '';
  return (
    <li className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <span className={strong ? 'font-medium text-white' : 'text-apg-silver'}>{line.label}</span>
        {line.bookingCode ? (
          <p className="text-xs text-apg-silver/90">{line.bookingCode}</p>
        ) : null}
        {line.statusLabel ? (
          <p className="text-xs text-amber-200/90">Status: {line.statusLabel}</p>
        ) : null}
      </div>
      <span
        className={`shrink-0 tabular-nums ${
          line.isDeduction
            ? 'font-medium text-rose-300'
            : strong
              ? 'text-base font-semibold text-white'
              : 'font-medium text-white'
        }`}
      >
        {prefix}
        {paiseToInr(line.amountPaise)}
      </span>
    </li>
  );
}

const RESULT_TONE_CLASS: Record<PaymentExplanationView['resultTone'], string> = {
  success: 'text-emerald-300',
  warning: 'text-amber-200',
  info: 'text-sky-300',
  danger: 'text-rose-300',
};

const NET_TONE_CLASS = {
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  neutral: 'text-apg-silver',
} as const;

export function PaymentExplanationBlock({
  explanation,
}: {
  explanation: PaymentExplanationView;
}) {
  const [traceOpen, setTraceOpen] = useState(false);

  const calculationSumPaise = explanation.calculationLines.reduce((sum, line) => {
    if (line.amountPrefix === '+') return sum + line.amountPaise;
    if (line.isDeduction || line.amountPrefix === '−') return sum - line.amountPaise;
    return sum + line.amountPaise;
  }, 0);
  const arithmeticMatches =
    explanation.calculationLines.length === 0 ||
    calculationSumPaise === explanation.totalExpectedPaise;

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-[#121820] p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-apg-silver/80">
        Payment explanation
      </p>

      {explanation.newBookingLines.length > 0 ? (
        <div className="mt-4">
          <SectionTitle>New booking</SectionTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {explanation.newBookingLines.map((line) => (
              <MoneyLine key={line.key} line={line} />
            ))}
          </ul>
        </div>
      ) : null}

      {explanation.depositCalculationLines.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <SectionTitle>Deposit calculation</SectionTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {explanation.depositCalculationLines.map((line) => (
              <MoneyLine key={line.key} line={line} />
            ))}
          </ul>
        </div>
      ) : null}

      {explanation.netDepositPosition ? (
        <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3">
          <SectionTitle>Net deposit position</SectionTitle>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-apg-silver">Refundable deposits</dt>
              <dd className="font-medium tabular-nums text-white">
                {paiseToInr(explanation.netDepositPosition.refundableDepositsPaise)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-apg-silver">Outstanding deposits</dt>
              <dd className="font-medium tabular-nums text-white">
                {paiseToInr(explanation.netDepositPosition.outstandingDepositsPaise)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
              <dt className="font-medium text-white">Net resident position</dt>
              <dd
                className={`font-semibold tabular-nums ${NET_TONE_CLASS[explanation.netDepositPosition.netTone]}`}
              >
                {explanation.netDepositPosition.netLabel}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-4">
        <SectionTitle>Calculation</SectionTitle>
        <ul className="mt-2 space-y-2 text-sm">
          {explanation.calculationLines.map((line) => (
            <MoneyLine key={line.key} line={line} />
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
          <span className="text-sm font-semibold uppercase tracking-wide text-white">
            Total expected
          </span>
          <span className="text-lg font-semibold tabular-nums text-white">
            {paiseToInr(explanation.totalExpectedPaise)}
          </span>
        </div>
        {!arithmeticMatches ? (
          <p className="mt-1 text-xs text-rose-300">
            Line items sum to {paiseToInr(calculationSumPaise)} — verify booking snapshot.
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-sm text-apg-silver">Customer paid</span>
          <span className="text-lg font-semibold tabular-nums text-emerald-300">
            {explanation.customerPaidPaise != null
              ? paiseToInr(explanation.customerPaidPaise)
              : 'Not declared'}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
          <span className="text-sm font-semibold text-white">Result</span>
          <span className={`text-sm font-semibold ${RESULT_TONE_CLASS[explanation.resultTone]}`}>
            {explanation.resultLabel}
          </span>
        </div>
      </div>

      {explanation.afterApproval ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <SectionTitle>After approval</SectionTitle>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-apg-silver">Rent collected</dt>
              <dd className="font-medium tabular-nums text-white">
                {paiseToInr(explanation.afterApproval.rentCollectedPaise)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-apg-silver">Deposit collected</dt>
              <dd className="font-medium tabular-nums text-white">
                {paiseToInr(explanation.afterApproval.depositCollectedPaise)}
              </dd>
            </div>
            {explanation.afterApproval.previousBalanceCollectedPaise > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-apg-silver">Previous balance collected</dt>
                <dd className="font-medium tabular-nums text-white">
                  {paiseToInr(explanation.afterApproval.previousBalanceCollectedPaise)}
                </dd>
              </div>
            ) : null}
            {explanation.afterApproval.remainingDepositLiabilityPaise > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-apg-silver">
                  Remaining deposit liability
                  {explanation.afterApproval.remainingDepositLiabilitySource ? (
                    <span className="mt-0.5 block text-xs font-normal text-apg-silver/80">
                      ({explanation.afterApproval.remainingDepositLiabilitySource})
                    </span>
                  ) : null}
                </dt>
                <dd className="font-medium tabular-nums text-amber-200">
                  {paiseToInr(explanation.afterApproval.remainingDepositLiabilityPaise)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
              <dt className="font-medium text-white">Resident balance due</dt>
              <dd
                className={`font-semibold tabular-nums ${
                  explanation.afterApproval.residentBalanceDuePaise <= 0
                    ? 'text-emerald-300'
                    : 'text-amber-200'
                }`}
              >
                {paiseToInr(explanation.afterApproval.residentBalanceDuePaise)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {explanation.financialTrace.length > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setTraceOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-xs font-medium text-apg-silver hover:bg-white/5 hover:text-white"
            aria-expanded={traceOpen}
          >
            <span>Show financial trace</span>
            <span className="text-[10px] uppercase tracking-wide">{traceOpen ? 'Hide' : 'Show'}</span>
          </button>
          {traceOpen ? (
            <div className="mt-2 space-y-3 rounded-lg border border-white/10 bg-[#0f1318] p-3">
              <p className="text-[10px] uppercase tracking-wide text-apg-silver/70">
                Admin only — not visible to residents
              </p>
              {explanation.financialTrace.map((entry) => (
                <div
                  key={`${entry.kind}-${entry.bookingId}`}
                  className="border-b border-white/5 pb-3 last:border-0 last:pb-0"
                >
                  <p className="text-sm font-semibold text-white">{entry.bookingCode}</p>
                  <dl className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-apg-silver">Refundable amount</dt>
                      <dd className="font-medium text-white">
                        {entry.kind === 'refundable' ? paiseToInr(entry.amountPaise) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-apg-silver">Outstanding amount</dt>
                      <dd className="font-medium text-white">
                        {entry.kind === 'outstanding' ? paiseToInr(entry.amountPaise) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-apg-silver">Status</dt>
                      <dd className="font-medium text-white">{entry.status}</dd>
                    </div>
                    <div>
                      <dt className="text-apg-silver">Transfer status</dt>
                      <dd className="font-medium text-white">{entry.transferStatus}</dd>
                    </div>
                    <div>
                      <dt className="text-apg-silver">Impact on this booking</dt>
                      <dd className="font-medium text-white">{entry.impactOnThisBooking}</dd>
                    </div>
                    {entry.addedToCheckout != null ? (
                      <div>
                        <dt className="text-apg-silver">Added to checkout</dt>
                        <dd className="font-medium text-white">{entry.addedToCheckout ? 'Yes' : 'No'}</dd>
                      </div>
                    ) : null}
                    {entry.reason ? (
                      <div className="sm:col-span-2">
                        <dt className="text-apg-silver">Reason</dt>
                        <dd className="font-medium text-white">{entry.reason}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
