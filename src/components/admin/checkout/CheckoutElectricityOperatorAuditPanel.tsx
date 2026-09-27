'use client';

import { useState } from 'react';
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
  defaultExpanded = false,
}: {
  audit: CheckoutElectricityOperatorAudit;
  vacatingDate: string;
  className?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const ledger = audit.meterPeriodLedger;
  const monthLabel = formatBillingMonthLabel(audit.billingMonth);
  const finalized = ledger.periods.find((p) => p.id === 'finalized');
  const tail = ledger.periods.find((p) => p.id === 'unbilled_tail');
  const resident = ledger.currentResident;

  const summaryDeduction = inr(ledger.suggestedDepositDeductionPaise);

  return (
    <section className={'rounded-2xl border border-white/[0.08] bg-[#0E1116] ' + className}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">
            Electricity detail
          </p>
          <p className="mt-1 text-sm text-white">
            Deduction from deposit: <span className="font-semibold text-rose-200">{summaryDeduction}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-apg-silver">{monthLabel}</p>
        </div>
        <span className="text-apg-silver">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-white/[0.06] px-5 pb-5 pt-4">
          {finalized ? (
            <Block title="Finalized period">
              <p className="text-sm font-medium text-white">
                {finalized.openingUnits} → {finalized.closingUnits}
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Gross" value={inr(finalized.grossPaise)} />
                <Row label="Already collected" value={inr(finalized.collectedPaise)} positive />
                <Row label="Remaining" value={inr(finalized.remainingPaise)} />
              </dl>
              {ledger.collectionRows.length > 0 ? (
                <ul className="mt-3 space-y-1 text-xs text-apg-silver">
                  {ledger.collectionRows.map((row) => (
                    <li key={row.customerId} className="flex justify-between gap-2">
                      <span>{row.customerName}</span>
                      <span className="text-emerald-300">{inr(row.collectedPaise)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Block>
          ) : null}

          {tail ? (
            <Block title="Unbilled tail">
              <p className="text-sm font-medium text-white">
                {tail.openingUnits} → {tail.closingUnits} · {tail.unitsConsumed} units
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Gross" value={inr(tail.grossPaise)} emphasis />
                <Row label="Occupancy window" value={`${tail.periodStart} → ${tail.periodEndExclusive}`} />
              </dl>
            </Block>
          ) : null}

          {tail && ledger.tailAllocationLines.length > 0 ? (
            <Block title="Tail allocation">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-xs">
                  <thead className="text-apg-silver">
                    <tr>
                      <th className="pb-2 pr-2 font-medium">Resident</th>
                      <th className="pb-2 pr-2 font-medium">Days</th>
                      <th className="pb-2 pr-2 font-medium">Share</th>
                      <th className="pb-2 pr-2 font-medium">Paid (tail)</th>
                      <th className="pb-2 font-medium">Remaining</th>
                    </tr>
                  </thead>
                  <tbody className="text-white">
                    {ledger.tailAllocationLines.map((line) => (
                      <tr key={line.customerId} className="border-t border-white/[0.06]">
                        <td className="py-2 pr-2">{line.customerName}</td>
                        <td className="py-2 pr-2 tabular-nums">{line.occupancyDays}</td>
                        <td className="py-2 pr-2 tabular-nums">{inr(line.fairSharePaise)}</td>
                        <td className="py-2 pr-2 tabular-nums text-emerald-300">
                          {inr(line.collectedPaise)}
                        </td>
                        <td className="py-2 tabular-nums">{inr(line.checkoutSharePaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          ) : null}

          <Block title="This resident">
            <dl className="space-y-2 text-sm">
              <Row
                label="Occupancy"
                value={activeOccupancyLabel(
                  resident.occupancyStart,
                  resident.occupancyEndExclusive,
                  vacatingDate,
                )}
              />
              {tail ? (
                <>
                  <Row label="Tail calculated share" value={inr(resident.tailCalculatedSharePaise)} />
                  <Row
                    label="Already paid for this tail"
                    value={inr(resident.tailAlreadyCollectedPaise)}
                    positive
                  />
                </>
              ) : null}
              <Row
                label="Finalized invoice remaining"
                value={inr(resident.finalizedInvoiceRemainingPaise)}
              />
              <Row
                label="Electricity deduction (total)"
                value={inr(resident.totalElectricityDeductionPaise)}
                deduct
                emphasis
              />
            </dl>
          </Block>
        </div>
      ) : null}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-apg-silver">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
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
