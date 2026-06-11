import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignTenantForm } from '@/src/components/admin/AssignTenantForm';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ResidentSearchPicker } from '@/src/components/admin/ResidentSearchPicker';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { eq } from 'drizzle-orm';
import {
  defaultTenantStartDate,
  listAssignableBeds,
} from '@/src/services/tenantAssignment';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssignTenantPage({
  searchParams,
}: {
  searchParams: Promise<{ bedId?: string; customerId?: string }>;
}) {
  const session = await requireAdminPermission('bookings:write');
  const sp = await searchParams;
  const bedRows = await listAssignableBeds(session);

  const beds = bedRows.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}`,
  }));

  let prefill: {
    customerId: string;
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
  } | null = null;

  if (sp.customerId && UUID_RE.test(sp.customerId)) {
    const [row] = await db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        email: customers.email,
        phone: customers.phone,
        gender: customers.gender,
        archivedAt: customers.archivedAt,
      })
      .from(customers)
      .where(eq(customers.id, sp.customerId))
      .limit(1);
    if (row && !row.archivedAt) {
      prefill = {
        customerId: row.id,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        gender: row.gender,
      };
    }
  }

  if (sp.customerId && !prefill) notFound();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link href="/admin/residents" className="text-sm text-zinc-500 hover:text-[#FF5A1F]">
          ← Residents
        </Link>
        <Link href="/admin/bookings" className="text-sm text-zinc-500 hover:text-[#FF5A1F]">
          Bookings
        </Link>
      </div>

      <PageHeader
        title={prefill ? `Assign ${prefill.fullName}` : 'Assign tenant'}
        description={
          prefill
            ? 'Choose a bed, set rent and deposit — monthly billing starts automatically from move-in.'
            : 'Search for someone who signed up on the website, then assign them to a bed.'
        }
      />

      <div className="mb-6">
        <ResidentSearchPicker
          selectedCustomerId={prefill?.customerId}
          selectedName={prefill?.fullName}
          bedId={sp.bedId}
        />
      </div>

      {prefill ? (
        <AssignTenantForm
          beds={beds}
          defaultBedId={sp.bedId}
          defaultStartDate={defaultTenantStartDate()}
          prefill={prefill}
        />
      ) : (
        <div className="max-w-xl rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-8 text-sm text-zinc-600">
          <p className="font-semibold text-zinc-800">Step 2: Bed, rent & deposit</p>
          <p className="mt-2">
            Search and select a resident above, or open{' '}
            <Link href="/admin/residents" className="font-semibold text-[#FF5A1F] hover:underline">
              Residents
            </Link>{' '}
            and click <strong>Assign</strong> next to their name. The assignment form appears once
            someone is selected.
          </p>
        </div>
      )}

      {prefill ? (
        <div className="mt-8 max-w-xl rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          <p className="font-semibold text-zinc-800">After assignment</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Rent invoices generate automatically each month.</li>
            <li>They pay rent + electricity from their resident dashboard or QR collections.</li>
            <li>
              Manage them anytime from{' '}
              <Link
                href={`/admin/residents/${prefill.customerId}`}
                className="font-semibold text-[#FF5A1F] hover:underline"
              >
                their resident profile
              </Link>
              .
            </li>
          </ol>
        </div>
      ) : null}
    </>
  );
}
