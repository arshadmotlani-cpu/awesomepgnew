import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { BedAssignmentAdvancedTools } from '@/src/components/admin/beds/BedAssignmentAdvancedTools';
import { BedAssignmentQueue } from '@/src/components/admin/beds/BedAssignmentQueue';
import { BedAvailabilityCommandCenter } from '@/src/components/admin/beds/BedAvailabilityCommandCenter';
import { BedSmartRecommendations } from '@/src/components/admin/beds/BedSmartRecommendations';
import { PgBedMapPanel } from '@/src/components/admin/PgBedMapPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { db } from '@/src/db/client';
import { customers } from '@/src/db/schema';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import {
  loadBedAssignmentCommand,
  loadPgBedMapForCommand,
  listAssignableBedsWithRoom,
} from '@/src/services/bedAssignmentCommand';
import { defaultTenantStartDate } from '@/src/services/tenantAssignment';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BedAssignmentCommandCenterPage({
  searchParams,
}: {
  searchParams: Promise<{ pgId?: string; bedId?: string; customerId?: string }>;
}) {
  const session = await requireAdminPermission('bookings:write');
  const sp = await searchParams;

  const command = await loadBedAssignmentCommand(session);

  const defaultPgId = command.pgRows[0]?.pgId ?? command.queue[0]?.recommendedPgId ?? null;
  const pgId =
    sp.pgId && command.pgRows.some((p) => p.pgId === sp.pgId) ? sp.pgId : defaultPgId;

  if (!pgId) {
    return (
      <>
        <PageHeader
          title="Bed assignment"
          description="No PGs with beds configured yet."
        />
        <BedAvailabilityCommandCenter stats={command.stats} pgRows={command.pgRows} />
        <BedAssignmentQueue items={command.queue} />
      </>
    );
  }

  const [{ map, moveBedOptions }, assignableRows] = await Promise.all([
    loadPgBedMapForCommand(session, pgId),
    listAssignableBedsWithRoom(session),
  ]);

  if (!map) notFound();

  let inlineAssign: {
    customerId: string;
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
    beds: Array<{ bedId: string; label: string; monthlyRatePaise: number; depositPaise: number }>;
    defaultStartDate: string;
    bedId: string;
  } | null = null;

  const bedId = sp.bedId && UUID_RE.test(sp.bedId) ? sp.bedId : null;
  const customerId = sp.customerId && UUID_RE.test(sp.customerId) ? sp.customerId : null;

  if (customerId && bedId) {
    const [customer] = await db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        email: customers.email,
        phone: customers.phone,
        gender: customers.gender,
        archivedAt: customers.archivedAt,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);

    if (customer && !customer.archivedAt) {
      inlineAssign = {
        customerId: customer.id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        gender: customer.gender,
        bedId,
        defaultStartDate: defaultTenantStartDate(),
        beds: assignableRows.map((b) => ({
          bedId: b.bedId,
          label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}`,
          monthlyRatePaise: b.monthlyRatePaise,
          depositPaise: b.depositPaise,
        })),
      };
    }
  }

  return (
    <>
      <PageHeader
        title="Bed assignment"
        description="Free beds, waiting residents, and assign directly from the map — no room-by-room hunting."
      />

      <BedAvailabilityCommandCenter stats={command.stats} pgRows={command.pgRows} />
      <BedAssignmentQueue items={command.queue} />
      <BedSmartRecommendations items={command.recommendations} />

      <section className="mb-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Visual bed map</h2>
            <p className="mt-1 text-sm text-apg-silver">
              Select a bed to assign, move, or manage move-out — without leaving this page.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {command.pgRows.map((pg) => (
              <Link
                key={pg.pgId}
                href={`/admin/beds?pgId=${pg.pgId}${bedId ? `&bedId=${bedId}` : ''}${customerId ? `&customerId=${customerId}` : ''}`}
                className={
                  'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
                  (pg.pgId === pgId
                    ? 'bg-[#FF5A1F] text-white'
                    : 'border border-white/10 text-apg-silver hover:text-white')
                }
              >
                {pg.pgName}
                {pg.freeBeds > 0 ? (
                  <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[10px]">
                    {pg.freeBeds} free
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </header>

        <PgBedMapPanel
          map={map}
          moveBedOptions={moveBedOptions}
          hideSummary
          commandCenterMode
          initialSelectedBedId={bedId}
          inlineAssign={inlineAssign}
        />
      </section>

      <BedAssignmentAdvancedTools />
    </>
  );
}
