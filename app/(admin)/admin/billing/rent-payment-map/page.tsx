import { BillingSectionSubNav } from '@/src/components/admin/billing/BillingSectionSubNav';
import { RentPaymentMapPageContent } from '@/src/components/admin/rentPaymentMap/RentPaymentMapPageContent';
import { moduleHref } from '@/src/lib/admin/navigation';
import { RENT_PAYMENT_MAP_HREF } from '@/src/lib/admin/rentPaymentMapRoutes';

export const dynamic = 'force-dynamic';

export default function BillingRentPaymentMapPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; pg?: string }>;
}) {
  return (
    <>
      <BillingSectionSubNav />
      <RentPaymentMapPageContent
        sessionPath={RENT_PAYMENT_MAP_HREF.billing}
        breadcrumbs={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: 'Billing Center', href: '/admin/billing' },
          { label: 'Rent Payment Map' },
        ]}
        searchParams={searchParams}
      />
    </>
  );
}
