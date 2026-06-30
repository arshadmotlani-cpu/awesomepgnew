import { paiseToInr } from '@/src/lib/format';
import type { ElectricitySettlementLedgerRow } from '@/src/services/electricitySettlementLedger';

export function ElectricityBillReconciliationPanel({
  actualBillPaise,
  checkoutCollectedPaise,
  manualCreditsPaise = 0,
  remainingToRecoverPaise,
  entries,
  compact = false,
}: {
  actualBillPaise: number;
  checkoutCollectedPaise: number;
  manualCreditsPaise?: number;
  remainingToRecoverPaise: number;
  entries: ElectricitySettlementLedgerRow[];
  compact?: boolean;
}) {
  return (
    <section
      className={
        compact
          ? 'rounded-2xl border border-white/10 bg-white/[0.03] p-4'
          : 'rounded-3xl bg-[#1A1F27]/80 p-6 ring-1 ring-white/[0.06]'
      }
    >
      <h2 className="text-sm font-medium uppercase tracking-wider text-apg-silver">
        Room electricity bill
      </h2>

      <dl className="mt-4 space-y-3 text-sm">
        <Row label="Actual bill" value={paiseToInr(actualBillPaise)} />
        <Row
          label="Already collected from checkout settlements"
          value={paiseToInr(checkoutCollectedPaise)}
          muted
        />
        {manualCreditsPaise > 0 ? (
          <Row
            label="Manual / offline credits"
            value={paiseToInr(manualCreditsPaise)}
            muted
          />
        ) : null}
        <Row
          label="Remaining to recover"
          value={paiseToInr(remainingToRecoverPaise)}
          accent
        />
      </dl>

      {entries.length > 0 ? (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-apg-silver">
            Ledger entries
          </h3>
          <ul className="mt-3 space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium text-white">{entry.customerName}</p>
                  {entry.stayPeriodStart && entry.stayPeriodEnd ? (
                    <p className="text-xs text-apg-silver">
                      {entry.stayPeriodStart} → {entry.stayPeriodEnd}
                    </p>
                  ) : null}
                </div>
                <p className="font-semibold text-white">{paiseToInr(entry.amountPaise)}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : checkoutCollectedPaise <= 0 ? (
        <p className="mt-4 text-sm text-apg-silver">
          No checkout electricity collected for this billing month yet.
        </p>
      ) : null}
    </section>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-apg-silver">{label}</dt>
      <dd
        className={
          accent
            ? 'text-xl font-semibold text-[#FF5A1F]'
            : muted
              ? 'font-medium text-white/80'
              : 'font-medium text-white'
        }
      >
        {value}
      </dd>
    </div>
  );
}
