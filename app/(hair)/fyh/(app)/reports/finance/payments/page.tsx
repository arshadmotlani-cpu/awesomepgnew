import { formatInrFromPaise } from '@/src/hair/lib/money';
import { salonDayBounds, salonMonthStartUtc } from '@/src/hair/lib/salonTime';
import { ReportEmpty, ReportShell, ReportTable } from '@/src/hair/components/reports/ReportShell';
import { paymentMethodSplit } from '@/src/hair/services/reportQueries';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function FinancePaymentsReportPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const { end } = salonDayBounds(tz);
  const from = salonMonthStartUtc(tz);
  const rows = await paymentMethodSplit({ from, to: end });
  const totalPaise = rows.reduce((s, r) => s + r.amountPaise, 0);

  return (
    <ReportShell
      title="Finance · Payment methods"
      subtitle="This month · ledger tender movements"
      timezone={tz}
      reportKey="payment-methods"
    >
      {rows.length === 0 ? (
        <ReportEmpty message="No tender payments recorded this month. Complete checkouts with cash, UPI, or card." />
      ) : (
        <>
          <p className="border-b border-[color:var(--fyh-border)] px-4 py-3 text-sm text-fyh-text-secondary">
            Total collected{' '}
            <span className="font-medium tabular-nums text-fyh-accent">
              {formatInrFromPaise(totalPaise)}
            </span>
          </p>
          <ReportTable
            headers={['Method', 'Amount', 'Entries']}
            rows={rows.map((r) => [
              r.method,
              <span key="amt" className="tabular-nums text-fyh-accent">
                {formatInrFromPaise(r.amountPaise)}
              </span>,
              r.entryCount,
            ])}
          />
        </>
      )}
    </ReportShell>
  );
}
