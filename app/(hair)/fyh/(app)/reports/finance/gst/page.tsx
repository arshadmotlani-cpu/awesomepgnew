import { formatInrFromPaise } from '@/src/hair/lib/money';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { ReportEmpty, ReportShell, ReportTable } from '@/src/hair/components/reports/ReportShell';
import { gstDetailReport } from '@/src/hair/services/reportQueries';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function FinanceGstReportPage() {
  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const rows = await gstDetailReport({ from, to: end });
  const totalTax = rows.reduce((s, r) => s + r.taxPaise, 0);

  return (
    <ReportShell
      title="Finance · GST detail"
      subtitle="This month · tax from paid invoice snapshots"
      timezone={tz}
      reportKey="gst-detail"
    >
      {rows.length === 0 ? (
        <ReportEmpty message="No paid invoices with GST this month." />
      ) : (
        <>
          <p className="border-b border-[color:var(--fyh-border)] px-4 py-3 text-sm text-fyh-text-secondary">
            Total GST{' '}
            <span className="font-medium tabular-nums text-fyh-accent">
              {formatInrFromPaise(totalTax)}
            </span>
          </p>
          <ReportTable
            headers={['Invoice', 'Paid', 'Subtotal', 'GST', 'Grand total']}
            rows={rows.map((r) => [
              r.invoiceNumber,
              r.paidAt ? r.paidAt.toISOString().slice(0, 10) : '—',
              formatInrFromPaise(r.subtotalPaise),
              <span key="tax" className="tabular-nums text-fyh-accent">
                {formatInrFromPaise(r.taxPaise)}
              </span>,
              formatInrFromPaise(r.grandTotalPaise),
            ])}
          />
        </>
      )}
    </ReportShell>
  );
}
