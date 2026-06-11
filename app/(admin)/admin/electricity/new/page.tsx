import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listRoomsForElectricityForm } from '@/src/db/queries/admin';
import { NewElectricityBillForm } from '@/src/components/admin/NewElectricityBillForm';
import { defaultBillingMonth } from '@/src/lib/dateDefaults';

export const dynamic = 'force-dynamic';

export default async function NewElectricityBillPage() {
  const rooms = await listRoomsForElectricityForm();
  const thisMonth = defaultBillingMonth();

  return (
    <>
      <PageHeader
        title="New electricity bill"
        description="Pick a room, enter meter readings + rate. The system splits the total across monthly residents by active days in the billing month and creates per-resident invoices in one transaction."
      />
      <Link
        href="/admin/electricity"
        className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
      >
        ← Back to electricity bills
      </Link>
      {!rooms.ok ? (
        <div className="mt-4">
          <DbStatusBanner error={rooms.error} />
        </div>
      ) : (
        <div className="mt-4 max-w-xl">
          <NewElectricityBillForm rooms={rooms.data} defaultMonth={thisMonth} />
        </div>
      )}
    </>
  );
}
