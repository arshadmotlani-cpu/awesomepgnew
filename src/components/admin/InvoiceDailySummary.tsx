import { paiseToInr } from '@/src/lib/format';
import type { InvoiceDailySummary as Summary } from '@/src/services/invoiceCommandCenter';

const METRICS: Array<{
  key: keyof Summary;
  label: string;
  format: 'money' | 'count';
}> = [
  { key: 'rentCollectedPaise', label: 'Rent collected', format: 'money' },
  { key: 'reservationPaymentsPaise', label: 'Reservation payments', format: 'money' },
  { key: 'depositsCollectedPaise', label: 'Deposits collected', format: 'money' },
  { key: 'checkoutDeductionsPaise', label: 'Checkout deductions', format: 'money' },
  { key: 'refundsPaidPaise', label: 'Refunds paid', format: 'money' },
  { key: 'netRevenuePaise', label: 'Net revenue', format: 'money' },
  { key: 'invoicesGeneratedCount', label: 'Invoices generated', format: 'count' },
  { key: 'invoicesPaidCount', label: 'Invoices paid', format: 'count' },
  { key: 'invoicesPendingCount', label: 'Invoices pending', format: 'count' },
];

export function InvoiceDailySummary({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
      {METRICS.map(({ key, label, format }) => {
        const raw = summary[key];
        const value =
          format === 'money' && typeof raw === 'number' ? paiseToInr(raw) : String(raw ?? 0);
        const highlight = key === 'netRevenuePaise';
        return (
          <div
            key={key}
            className={`rounded-xl border p-4 ${
              highlight
                ? 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10'
                : 'border-white/10 bg-[#1A1F27]'
            }`}
          >
            <p className="text-[10px] uppercase text-apg-silver">{label}</p>
            <p className={`mt-2 text-xl font-semibold ${highlight ? 'text-[#FF5A1F]' : 'text-white'}`}>
              {value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
