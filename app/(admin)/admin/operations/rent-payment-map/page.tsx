import { OperationsSectionSubNav } from '@/src/components/admin/operations/OperationsSectionSubNav';
import { RentPaymentMapPageContent } from '@/src/components/admin/rentPaymentMap/RentPaymentMapPageContent';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { RENT_PAYMENT_MAP_HREF } from '@/src/lib/admin/rentPaymentMapRoutes';

export const dynamic = 'force-dynamic';

export default function OperationsRentPaymentMapPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; pg?: string }>;
}) {
  return (
    <>
      <OperationsSectionSubNav />
      <RentPaymentMapPageContent
        sessionPath={RENT_PAYMENT_MAP_HREF.operations}
        breadcrumbs={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label, href: ADMIN_MODULES.operations.href },
          { label: 'Rent Payment Map' },
        ]}
        searchParams={searchParams}
      />
    </>
  );
}
