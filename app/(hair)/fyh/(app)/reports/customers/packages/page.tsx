import { ReportEmpty, ReportShell, ReportTable } from '@/src/hair/components/reports/ReportShell';
import { packagesReport } from '@/src/hair/services/reportQueries';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function CustomersPackagesReportPage() {
  const settings = await getSalonSettings();
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const rows = await packagesReport();

  return (
    <ReportShell
      title="Customers · Packages"
      subtitle="Active session packages"
      timezone={tz}
      reportKey="packages"
    >
      {rows.length === 0 ? (
        <ReportEmpty message="No active packages. Sell a package from Quick Sale." />
      ) : (
        <ReportTable
          headers={['Customer', 'Phone', 'Plan', 'Total', 'Used', 'Remaining', 'Expires']}
          rows={rows.map((r) => [
            r.customerName,
            r.phone,
            r.planName,
            r.totalSessions,
            r.usedSessions,
            <span
              key="rem"
              className={r.remainingSessions === 0 ? 'text-amber-400' : 'tabular-nums font-medium'}
            >
              {r.remainingSessions}
            </span>,
            r.expiresOn ?? '—',
          ])}
        />
      )}
    </ReportShell>
  );
}
