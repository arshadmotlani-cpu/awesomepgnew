import { EditTenantTenancyForm } from '@/src/components/admin/EditTenantTenancyForm';
import { CommandCenterTimeline } from '@/src/components/admin/residents/command-center/CommandCenterTimeline';
import { CommandCenterBookingDepositsList } from '@/src/components/admin/residents/command-center/CommandCenterSections';
import type { AdminSession } from '@/src/lib/auth/session';
import type {
  CommandCenterBookingHistoryRow,
  ResidentCommandCenterData,
} from '@/src/lib/residents/commandCenterTypes';
import {
  loadResidentBookingDepositsForCustomer,
  loadResidentTimelineForCustomer,
} from '@/src/services/residentCommandCenter';
import { listAssignableBeds } from '@/src/services/tenantAssignment';

type BedOption = { bedId: string; label: string };

function bedOptionsFromRows(
  assignableRows: Awaited<ReturnType<typeof listAssignableBeds>>,
  activeTenancy: ResidentCommandCenterData['activeTenancy'],
): BedOption[] {
  const bedOptions = assignableRows.map((b) => ({
    bedId: b.bedId,
    label: `${b.pgName} · Room ${b.roomNumber} · ${b.bedCode}${b.manualOccupied ? ' · marked occupied' : ''}`,
  }));

  if (activeTenancy) {
    const currentLabel = `${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}`;
    if (!bedOptions.some((b) => b.bedId === activeTenancy.bedId)) {
      bedOptions.unshift({ bedId: activeTenancy.bedId, label: `${currentLabel} (current)` });
    }
  }

  return bedOptions;
}

export async function ResidentProfileTimelineSection({
  session,
  customerId,
}: {
  session: AdminSession;
  customerId: string;
}) {
  const timeline = await loadResidentTimelineForCustomer(session, customerId);
  return <CommandCenterTimeline timeline={timeline} />;
}

export async function ResidentProfileBookingDepositsSection({
  customerId,
  bookingHistory,
  activeBookingId,
}: {
  customerId: string;
  bookingHistory: CommandCenterBookingHistoryRow[];
  activeBookingId: string | null;
}) {
  const bookingDeposits = await loadResidentBookingDepositsForCustomer(
    customerId,
    bookingHistory,
    activeBookingId,
  );
  if (bookingDeposits.length === 0) return null;
  return <CommandCenterBookingDepositsList rows={bookingDeposits} />;
}

export async function ResidentProfileBedTenancySection({
  session,
  data,
}: {
  session: AdminSession;
  data: ResidentCommandCenterData;
}) {
  const t = data.activeTenancy;
  if (!t) return null;

  const assignableRows = await listAssignableBeds(session, undefined, { skipDepositQuotes: true });
  const bedOptions = bedOptionsFromRows(assignableRows, t);

  return (
    <div id="edit-tenancy">
      <EditTenantTenancyForm
        bookingId={t.bookingId}
        customerId={data.customer.id}
        customerName={data.customer.fullName}
        customerPhone={data.customer.phone}
        currentBedId={t.bedId}
        currentRoomLabel={`${t.pgName} · Room ${t.roomNumber} · ${t.bedCode}`}
        blocksWholeRoom={t.blocksRoomAvailability}
        beds={bedOptions}
      />
    </div>
  );
}
