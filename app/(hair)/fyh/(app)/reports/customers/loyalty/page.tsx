import { formatInrFromPaise } from '@/src/hair/lib/money';
import { ReportEmpty, ReportShell, ReportTable } from '@/src/hair/components/reports/ReportShell';
import { loyaltyReport } from '@/src/hair/services/reportQueries';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function CustomersLoyaltyReportPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const rows = await loyaltyReport();

  return (
    <ReportShell
      title="Customers · Loyalty"
      subtitle="Reward points and membership labels"
      timezone={tz}
      reportKey="loyalty"
    >
      {rows.length === 0 ? (
        <ReportEmpty message="No customers with reward points or membership yet." />
      ) : (
        <ReportTable
          headers={['Customer', 'Phone', 'Points', 'Lifetime spend', 'Membership']}
          rows={rows.map((r) => [
            r.customerName,
            r.phone,
            <span key="pts" className="tabular-nums font-medium">
              {r.rewardPoints}
            </span>,
            formatInrFromPaise(r.lifetimeSpendPaise),
            r.membership ?? '—',
          ])}
        />
      )}
    </ReportShell>
  );
}
