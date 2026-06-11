import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignTenantForm } from '@/src/components/admin/AssignTenantForm';
import { PageHeader } from '@/src/components/admin/PageHeader';
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
      <div className="mb-4">
        <Link
          href={prefill ? `/admin/residents/${prefill.customerId}` : '/admin/residents'}
          className="text-sm text-zinc-500 hover:text-[#FF5A1F]"
        >
          ← Back to {prefill ? 'resident' : 'residents'}
        </Link>
      </div>

      <PageHeader
        title={prefill ? `Assign ${prefill.fullName}` : 'Assign tenant'}
        description="Link a tenant to a bed with rent, deposit, and optional whole-room blocking. If they already signed up, use the same phone/email so their dashboard matches."
      />

      <AssignTenantForm
        beds={beds}
        defaultBedId={sp.bedId}
        defaultStartDate={defaultTenantStartDate()}
        prefill={prefill}
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
