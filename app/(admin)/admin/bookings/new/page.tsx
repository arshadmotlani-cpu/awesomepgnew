import Link from 'next/link';
import { AssignTenantForm } from '@/src/components/admin/AssignTenantForm';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  defaultTenantStartDate,
  listAssignableBeds,
} from '@/src/services/tenantAssignment';

export const dynamic = 'force-dynamic';

export default async function AssignTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ bedId?: string }>;
}) {
  const session = await requireAdminPermission('bookings:write');
  const sp = await searchParams;
  const bedRows = await listAssignableBeds(session);

  const beds = bedRows.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}`,
  }));

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/bookings" className="text-sm text-zinc-500 hover:text-[#FF5A1F]">
          ← Back to bookings
        </Link>
      </div>

      <PageHeader
        title="Assign tenant"
        description="Link an existing on-site tenant to a bed with their rent, deposit, and optional whole-room blocking. They can sign up on the website with the same phone/email to access their resident dashboard."
      />

      <AssignTenantForm
        beds={beds}
        defaultBedId={sp.bedId}
        defaultStartDate={defaultTenantStartDate()}
      />

      <div className="mt-8 max-w-xl rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        <p className="font-semibold text-zinc-800">Rollout checklist</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Tenant signs up at the website (same phone number you enter here).</li>
          <li>Assign them to their bed with grandfathered rent if needed.</li>
          <li>Generate rent invoices from 1st of next month.</li>
          <li>They pay rent + electricity via resident dashboard or QR collections.</li>
        </ol>
      </div>
    </>
  );
}
