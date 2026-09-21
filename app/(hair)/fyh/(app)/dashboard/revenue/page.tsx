import { requirePermissionPage } from '@/src/hair/lib/auth/permissions';
import { RevenueDashboard } from '@/src/hair/components/dashboard/RevenueDashboard';
import { listTenantLocationOptions } from '@/src/hair/actions/tenant';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import {
  getRevenueDashboardReportForPage,
  parseLocationIdsParam,
  resolveDefaultReportRange,
} from '@/src/hair/services/revenueDashboardReport';
import { getSalonSettings } from '@/src/hair/services/settings';

export default async function RevenueDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; locations?: string }>;
}) {
  await requirePermissionPage('page:dashboard_revenue');
  const ctx = await getTenantContextForPage();
  const params = await searchParams;
  const settings = await getSalonSettings(ctx);
  const timezone = settings.timezone?.trim() || 'Asia/Kolkata';
  const defaults = resolveDefaultReportRange(timezone);

  const [report, locationOptions] = await Promise.all([
    getRevenueDashboardReportForPage(
      {
        fromDayKey: params.from,
        toDayKey: params.to,
        locationsParam: params.locations,
      },
      ctx,
    ),
    listTenantLocationOptions(),
  ]);

  const fromDayKey = params.from?.trim() || defaults.fromDayKey;
  const toDayKey = params.to?.trim() || defaults.toDayKey;
  const locationsParam =
    params.locations?.trim() ||
    (locationOptions.length > 1 ? 'all' : parseLocationIdsParam(null) === 'all' ? 'all' : 'all');

  return (
    <RevenueDashboard
      report={report}
      locationOptions={locationOptions}
      fromDayKey={fromDayKey}
      toDayKey={toDayKey}
      locationsParam={locationsParam}
    />
  );
}
