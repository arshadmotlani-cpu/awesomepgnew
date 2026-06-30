import Link from 'next/link';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ElectricityDuplicateWarningBanner } from '@/src/components/admin/electricity/ElectricityDuplicateWarningBanner';
import { ElectricityWizardLauncher } from '@/src/components/admin/ElectricityWizardLauncher';
import { ElectricityWizardProgress } from '@/src/components/admin/ElectricityWizardProgress';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { NewElectricityBillForm } from '@/src/components/admin/NewElectricityBillForm';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { listRoomsForElectricityForm } from '@/src/db/queries/admin';
import { moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { listRoomsMissingElectricityBill } from '@/src/services/electricityBilling';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { electricityBills, floors, pgs, rooms } from '@/src/db/schema';

export const dynamic = 'force-dynamic';

async function getLastElectricityBatchByPg() {
  const rows = await db
    .select({
      pgId: pgs.id,
      pgName: pgs.name,
      billingMonth: electricityBills.billingMonth,
      createdAt: electricityBills.createdAt,
    })
    .from(electricityBills)
    .innerJoin(rooms, eq(rooms.id, electricityBills.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .orderBy(desc(electricityBills.createdAt))
    .limit(50);

  const byPg = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    if (!byPg.has(row.pgId)) byPg.set(row.pgId, row);
  }
  return [...byPg.values()].sort((a, b) => a.pgName.localeCompare(b.pgName));
}

export default async function BillingElectricityGeneratePage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    pgId?: string;
    roomId?: string;
    wizard?: string;
    pgComplete?: string;
    done?: string;
  }>;
}) {
  const sp = await searchParams;
  const rooms = await listRoomsForElectricityForm();
  const billingMonth = resolveBillingMonth(sp.month);
  const lastBatches = await getLastElectricityBatchByPg();
  const missingRooms = await listRoomsMissingElectricityBill(billingMonth);
  const wizardMode = sp.wizard === '1' && Boolean(sp.pgId && sp.roomId);
  const pgRooms = sp.pgId ? missingRooms.filter((r) => r.pgId === sp.pgId) : [];
  const roomIdx = sp.roomId ? pgRooms.findIndex((r) => r.roomId === sp.roomId) : -1;
  const currentRoom = roomIdx >= 0 ? pgRooms[roomIdx] : null;
  const completedPgName = sp.pgComplete
    ? missingRooms.find((r) => r.pgId === sp.pgComplete)?.pgName ?? 'PG'
    : null;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Billing Center', href: moduleHref('collections') },
          { label: 'Generate electricity' },
        ]}
      />
      <PageHeader
        title="Generate electricity bill"
        description="Select a PG once, then enter only the current meter reading — room by room."
      />
      <div className="mt-4">
        <ElectricityDuplicateWarningBanner />
      </div>
      <Link
        href={`/admin/billing?tab=electricity&month=${billingMonth.slice(0, 7)}`}
        className="text-xs font-medium text-[#FF5A1F] hover:underline"
      >
        ← Back to Billing Center · Electricity
      </Link>

      {sp.done === '1' ? (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
          All eligible rooms are billed for {billingMonth.slice(0, 7)}.
          <Link href="/admin/billing?tab=electricity" className="ml-2 font-semibold underline">
            Back to electricity bills
          </Link>
        </div>
      ) : null}

      {completedPgName && wizardMode ? (
        <div className="mt-6 rounded-xl border border-sky-500/30 bg-sky-500/10 p-5 text-sm text-sky-100">
          <span className="font-semibold">{completedPgName}</span> is complete. Continuing with the
          next PG…
        </div>
      ) : null}

      {!wizardMode && sp.done !== '1' ? (
        <div className="mt-6">
          <ElectricityWizardLauncher
            missingRooms={missingRooms}
            billingMonth={billingMonth}
            defaultPgId={sp.pgId}
          />
        </div>
      ) : null}

      {lastBatches.length > 0 && !wizardMode ? (
        <section className="mt-6 rounded-xl border border-white/10 bg-[#1A1F27] p-5">
          <h2 className="text-sm font-semibold text-white">Last electricity batch by PG</h2>
          <ul className="mt-3 space-y-2 text-sm text-apg-silver">
            {lastBatches.map((b) => (
              <li key={b.pgId}>
                <span className="font-medium text-white">{b.pgName}</span>
                {' · '}
                {b.billingMonth.slice(0, 7)} ·{' '}
                {b.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!rooms.ok ? (
        <div className="mt-4">
          <DbStatusBanner error={rooms.error} />
        </div>
      ) : wizardMode && currentRoom ? (
        <div className="mt-4 w-full max-w-2xl">
          <ElectricityWizardProgress
            current={roomIdx + 1}
            total={pgRooms.length}
            pgName={currentRoom.pgName}
          />
          <NewElectricityBillForm
            rooms={rooms.data}
            defaultMonth={billingMonth}
            defaultRoomId={sp.roomId}
            defaultPgId={sp.pgId}
            wizardMode
            wizardPgId={sp.pgId}
            wizardRoomLabel={currentRoom.roomNumber}
            wizardProgress={`${currentRoom.pgName} · Room ${roomIdx + 1} of ${pgRooms.length}`}
          />
        </div>
      ) : !wizardMode && sp.done !== '1' ? (
        <div className="mt-4 w-full max-w-2xl">
          <NewElectricityBillForm
            rooms={rooms.data}
            defaultMonth={billingMonth}
            defaultRoomId={sp.roomId}
            defaultPgId={sp.pgId}
            showPgPicker
          />
        </div>
      ) : null}
    </>
  );
}
