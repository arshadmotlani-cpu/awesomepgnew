import type { RentPaymentMapSummary } from '@/src/lib/billing/rentPaymentMapStatus';

const METRICS: Array<{
  key: keyof RentPaymentMapSummary;
  label: string;
  tone: string;
}> = [
  { key: 'totalOccupied', label: 'Total occupied', tone: 'text-white' },
  { key: 'paid', label: 'Paid', tone: 'text-emerald-400' },
  { key: 'paymentSubmitted', label: 'Payment submitted', tone: 'text-amber-400' },
  { key: 'notPaid', label: 'Not paid', tone: 'text-rose-400' },
  { key: 'availableBeds', label: 'Available beds', tone: 'text-apg-silver' },
];

export function RentPaymentMapSummaryStrip({ summary }: { summary: RentPaymentMapSummary }) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {METRICS.map((metric) => (
        <div
          key={metric.key}
          className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
            {metric.label}
          </p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${metric.tone}`}>
            {summary[metric.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
