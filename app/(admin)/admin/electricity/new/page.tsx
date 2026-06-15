import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listRoomsForElectricityForm } from '@/src/db/queries/admin';
import { NewElectricityBillForm } from '@/src/components/admin/NewElectricityBillForm';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';

export const dynamic = 'force-dynamic';

export default async function NewElectricityBillPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const rooms = await listRoomsForElectricityForm();
  const billingMonth = resolveBillingMonth(sp.month);

  return (
    <>
      <PageHeader
        title="New electricity bill"
        description="Pick a room, enter meter readings + rate. The system splits the total across monthly residents by active days in the billing month and creates per-resident invoices in one transaction."
      />
      <Link
        href="/admin/collections?tab=electricity"
        className="text-xs font-medium text-[#FF5A1F] hover:underline"
      >
        ← Back to Collections · Electricity
      </Link>
      {!rooms.ok ? (
        <div className="mt-4">
          <DbStatusBanner error={rooms.error} />
        </div>
      ) : (
        <div className="mt-4 w-full max-w-2xl">
          <NewElectricityBillForm rooms={rooms.data} defaultMonth={billingMonth} />
        </div>
      )}
    </>
  );
}
