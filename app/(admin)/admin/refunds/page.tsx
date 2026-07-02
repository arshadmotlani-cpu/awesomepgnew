import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { RefundConsolePanel } from '@/src/components/admin/refunds/RefundConsolePanel';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  getRefundConsoleBookingDetail,
  searchRefundConsoleBookings,
} from '@/src/services/refundConsole';

export const dynamic = 'force-dynamic';

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; booking?: string }>;
}) {
  const sp = await searchParams;
  const query = sp.q?.trim() ?? '';
  const bookingId = sp.booking?.trim() ?? '';

  const [searchResults, detail] = await Promise.all([
    query ? searchRefundConsoleBookings(query) : Promise.resolve({ query, rows: [] }),
    bookingId ? getRefundConsoleBookingDetail(bookingId) : Promise.resolve(null),
  ]);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.refunds.label },
        ]}
      />
      <PageHeader
        title="Refund Console"
        description="Pay refunds, transfer deposits, and record deductions — one place for every booking wallet."
      />
      <RefundConsolePanel
        query={query}
        searchResults={searchResults.rows}
        detail={detail}
      />
    </>
  );
}
