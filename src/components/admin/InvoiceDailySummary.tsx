import { Badge } from '@/src/components/admin/Badge';
import { paiseToInr } from '@/src/lib/format';
import type { InvoiceDailySummary as Summary } from '@/src/services/invoiceCommandCenter';

const METRICS: Array<{
  key: keyof Summary;
  label: string;
  format: 'money' | 'count';
  alert?: boolean;
}> = [
  { key: 'rentCollectedPaise', label: 'Rent collected', format: 'money' },
  { key: 'electricityCollectedPaise', label: 'Electricity collected', format: 'money' },
  { key: 'depositCashCollectedPaise', label: 'Deposit cash collected', format: 'money' },
  { key: 'depositTransfersPaise', label: 'Deposit transfers', format: 'money' },
  { key: 'priorDepositSettledPaise', label: 'Prior deposit settled', format: 'money' },
  {
    key: 'bookingPaymentsUninvoicedPaise',
    label: 'Booking rent not invoiced',
    format: 'money',
    alert: true,
  },
  { key: 'checkoutDeductionsPaise', label: 'Checkout deductions', format: 'money' },
  { key: 'refundsPaidPaise', label: 'Refunds paid', format: 'money' },
  { key: 'netRevenuePaise', label: 'Net inflow', format: 'money' },
  { key: 'invoicesGeneratedCount', label: 'Invoices generated', format: 'count' },
  { key: 'invoicesPaidCount', label: 'Invoices paid', format: 'count' },
  { key: 'invoicesPendingCount', label: 'Invoices pending', format: 'count' },
];

export function InvoiceDailySummary({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
      {METRICS.map(({ key, label, format, alert }) => {
        const raw = summary[key];
        const value =
          format === 'money' && typeof raw === 'number' ? paiseToInr(raw) : String(raw ?? 0);
        const highlight = key === 'netRevenuePaise';
        const isAlert = alert && typeof raw === 'number' && raw > 0;
        return (
          <div
            key={key}
            className={`rounded-xl border p-4 ${
              highlight
                ? 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10'
                : isAlert
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-white/10 bg-[#1A1F27]'
            }`}
          >
            <p className="text-[10px] uppercase text-apg-silver">{label}</p>
            <p
              className={`mt-2 text-xl font-semibold ${
                highlight ? 'text-[#FF5A1F]' : isAlert ? 'text-amber-200' : 'text-white'
              }`}
            >
              {value}
            </p>
            {isAlert ? (
              <Badge tone="amber">Needs backfill</Badge>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
