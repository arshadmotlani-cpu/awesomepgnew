import { formatInrFromPaise } from '@/src/hair/lib/money';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { ReportEmpty, ReportShell, ReportTable } from '@/src/hair/components/reports/ReportShell';
import { DEFAULT_REPORT_PAGE_SIZE, discountsReport } from '@/src/hair/services/reportQueries';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function FinanceDiscountsReportPage() {
  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const rows = await discountsReport({ from, to: end });
  const totalPaise = rows.reduce((s, r) => s + r.totalDiscountPaise, 0);

  return (
    <ReportShell
      title="Finance · Discounts"
      subtitle="This month · invoice snapshot redemptions"
      timezone={tz}
      reportKey="discounts"
    >
      {rows.length === 0 ? (
        <ReportEmpty message="No discounts or membership/package redemptions on paid invoices this month." />
      ) : (
        <>
          <p className="border-b border-[color:var(--fyh-border)] px-4 py-3 text-sm text-fyh-text-secondary">
            Total discounts{' '}
            <span className="font-medium tabular-nums text-fyh-accent">
              {formatInrFromPaise(totalPaise)}
            </span>
          </p>
          <ReportTable
            truncated={rows.length >= DEFAULT_REPORT_PAGE_SIZE}
            headers={['Invoice', 'Customer', 'Paid', 'Line', 'Membership', 'Package', 'Total']}
            rows={rows.map((r) => [
              r.invoiceNumber,
              r.customerName,
              r.paidAt ? r.paidAt.toISOString().slice(0, 10) : '—',
              formatInrFromPaise(r.discountPaise),
              formatInrFromPaise(r.membershipRedemptionPaise),
              formatInrFromPaise(r.packageRedemptionPaise),
              <span key="tot" className="tabular-nums font-medium text-fyh-accent">
                {formatInrFromPaise(r.totalDiscountPaise)}
              </span>,
            ])}
          />
        </>
      )}
    </ReportShell>
  );
}
