'use client';

import { formatBillingMonthLabel } from '@/src/lib/billing/formatBillingMonth';
import { paiseToInr } from '@/src/lib/format';
import type { CheckoutElectricityOperatorAudit } from '@/src/lib/checkout/checkoutElectricityOperatorAudit';

function inr(paise: number): string {
  return `₹${paiseToInr(paise).replace(/\.00$/, '')}`;
}

export function CheckoutElectricityOperatorAuditPanel({
  audit,
  className = '',
}: {
  audit: CheckoutElectricityOperatorAudit;
  className?: string;
}) {
  const monthLabel = formatBillingMonthLabel(audit.billingMonth);

  return (
    <section
      className={
        'rounded-2xl border border-white/[0.08] bg-[#0E1116] p-5 ' + className
      }
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
        Electricity
      </h3>
      <p className="mt-1 text-[11px] text-apg-silver">{monthLabel} · Room period bill</p>

      <dl className="mt-4 space-y-2.5 text-sm">
        <AuditRow label="Historical bill" value={inr(audit.historicalBillPaise)} emphasis />
        {audit.residentBilledPaise != null ? (
          <AuditRow label="Resident electricity billed" value={inr(audit.residentBilledPaise)} />
        ) : null}
        <AuditRow label="Already collected" value={inr(audit.alreadyCollectedPaise)} positive />
        <AuditRow label="Electricity remaining" value={inr(audit.electricityRemainingPaise)} />
        <AuditRow
          label="Deduction from deposit"
          value={inr(audit.depositDeductionPaise)}
          deduct={audit.depositDeductionPaise > 0}
        />
      </dl>

      {audit.usesPersistedInvoiceForDisplay ? (
        <p className="mt-3 text-[11px] text-emerald-200/90">
          Amounts from this resident&apos;s electricity invoice on file — not recalculated fair share.
        </p>
      ) : null}

      {audit.hasFinalizedHistoricalBill &&
      audit.staleMeterDerivedBillPaise != null &&
      audit.staleMeterDerivedBillPaise !== audit.historicalBillPaise ? (
        <details className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <summary className="cursor-pointer px-3 py-2 text-[11px] text-apg-silver hover:text-white">
            Diagnostic: settlement meter reading (not used for refund)
          </summary>
          <p className="border-t border-white/[0.06] px-3 py-2 text-[11px] text-apg-silver">
            Raw meter math on this checkout row would imply {inr(audit.staleMeterDerivedBillPaise)}.
            Finalized room bill {inr(audit.historicalBillPaise)} is authoritative for {monthLabel}.
          </p>
        </details>
      ) : null}
    </section>
  );
}

function AuditRow({
  label,
  value,
  emphasis,
  positive,
  deduct,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  positive?: boolean;
  deduct?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-apg-silver">{label}</dt>
      <dd
        className={
          (emphasis ? 'text-base font-semibold ' : 'font-medium ') +
          (deduct ? 'text-rose-200' : positive ? 'text-emerald-300' : 'text-white')
        }
      >
        {value}
      </dd>
    </div>
  );
}
