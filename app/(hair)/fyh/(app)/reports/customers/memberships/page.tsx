import { ReportEmpty, ReportShell, ReportTable } from '@/src/hair/components/reports/ReportShell';
import { membershipsReport } from '@/src/hair/services/reportQueries';
import { getSalonSettings } from '@/src/hair/services/settings';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

export default async function CustomersMembershipsReportPage() {
  const ctx = await getTenantContextForPage();
  const settings = await getSalonSettings(ctx);
  const tz = settings.timezone?.trim() || 'Asia/Kolkata';
  const rows = await membershipsReport();

  return (
    <ReportShell
      title="Customers · Memberships"
      subtitle="Active membership plans"
      timezone={tz}
      reportKey="memberships"
    >
      {rows.length === 0 ? (
        <ReportEmpty message="No active memberships. Sell a plan from Quick Sale or customer profile." />
      ) : (
        <ReportTable
          headers={['Customer', 'Phone', 'Plan', 'Tier', 'Starts', 'Expires']}
          rows={rows.map((r) => [
            r.customerName,
            r.phone,
            r.planName,
            r.tier,
            r.startsOn,
            r.expiresOn,
          ])}
        />
      )}
    </ReportShell>
  );
}
