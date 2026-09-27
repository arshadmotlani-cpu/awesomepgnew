'use client';

import { formatBillingMonthLabel } from '@/src/lib/billing/formatBillingMonth';
import { activeOccupancyLabel } from '@/src/lib/billing/roomElectricityMeterPeriodLedger';
import type { CheckoutElectricityOperatorAudit } from '@/src/lib/checkout/checkoutElectricityOperatorAudit';
import { paiseToInr } from '@/src/lib/format';

function inr(paise: number): string {
  return `₹${paiseToInr(paise).replace(/\.00$/, '')}`;
}

export function CheckoutElectricityOperatorAuditPanel({
  audit,
  vacatingDate,
  className = '',
}: {
  audit: CheckoutElectricityOperatorAudit;
  vacatingDate: string;
  className?: string;
}) {
  const ledger = audit.meterPeriodLedger;
  const monthLabel = formatBillingMonthLabel(audit.billingMonth);
  const primary =
    ledger.primaryPeriodId != null
      ? ledger.periods.find((p) => p.id === ledger.primaryPeriodId)
      : ledger.periods[0];

  return (
    <section className={'rounded-2xl border border-white/[0.08] bg-[#0E1116] p-5 ' + className}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-apg-silver">Electricity</h3>
      <p className="mt-1 text-[11px] text-apg-silver">{monthLabel}</p>

      {ledger.periods.map((period) => (
        <div key={period.id} className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
            {period.label}
            {period.locked ? ' · locked' : ''}
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Row label="Opening reading" value={String(period.openingUnits)} />
            <Row label="Closing reading" value={String(period.closingUnits)} />
            <Row label="Units consumed" value={String(period.unitsConsumed)} />
            <Row label="Rate" value={`₹${(period.ratePerUnitPaise / 100).toFixed(2)}/unit`} />
            <Row label="Gross room electricity" value={inr(period.grossPaise)} emphasis />
            <Row label="Already collected (room)" value={inr(period.collectedPaise)} positive />
            <Row label="Remaining room electricity" value={inr(period.remainingPaise)} />
          </dl>
        </div>
      ))}

      {ledger.collectionRows.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
            Already collected
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {ledger.collectionRows.map((row) => (
              <li key={row.customerId} className="flex justify-between gap-3">
                <span className="text-apg-silver">{row.customerName}</span>
                <span className="text-emerald-300">{inr(row.collectedPaise)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between text-sm font-medium">
            <span className="text-apg-silver">Total collected</span>
            <span className="text-emerald-300">{inr(ledger.totalCollectedPaise)}</span>
          </p>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">
          Current resident
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <Row
            label="Occupancy dates"
            value={activeOccupancyLabel(
              ledger.currentResident.occupancyStart,
              ledger.currentResident.occupancyEndExclusive,
              vacatingDate,
            )}
          />
          <Row label="Calculated share" value={inr(ledger.currentResident.calculatedSharePaise)} />
          <Row
            label="Already collected from this resident"
            value={inr(ledger.currentResident.alreadyCollectedPaise)}
            positive
          />
          <Row label="Remaining from resident" value={inr(ledger.currentResident.remainingPaise)} />
          <Row
            label="Deduction from deposit"
            value={inr(ledger.suggestedDepositDeductionPaise)}
            deduct={ledger.suggestedDepositDeductionPaise > 0}
            emphasis
          />
        </dl>
      </div>

      {primary && ledger.periods.length > 1 ? (
        <p className="mt-3 text-[11px] text-apg-silver">
          Checkout liability uses {primary.openingUnits}→{primary.closingUnits} (
          {inr(primary.grossPaise)} gross) — not a second charge for the finalized monthly interval.
        </p>
      ) : null}
    </section>
  );
}

function Row({
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
          (emphasis ? 'font-semibold ' : '') +
          (deduct ? 'text-rose-200' : positive ? 'text-emerald-300' : 'text-white')
        }
      >
        {value}
      </dd>
    </div>
  );
}
