import Link from 'next/link';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { ArchiveResidentButton } from '@/src/components/admin/ArchiveResidentButton';
import { CreateChargeGeneratorForm } from '@/src/components/admin/CreateChargeGeneratorForm';
import { EditMoveInDateForm } from '@/src/components/admin/EditMoveInDateForm';
import { EditRentDueDateForm } from '@/src/components/admin/EditRentDueDateForm';
import { EditTenantTenancyForm } from '@/src/components/admin/EditTenantTenancyForm';
import { FinalSettlementPanel } from '@/src/components/admin/FinalSettlementPanel';
import { ResidentResidencyPanel } from '@/src/components/admin/residents/ResidentResidencyPanel';
import { CommandCenterQuickActions } from '@/src/components/admin/residents/command-center/CommandCenterQuickActions';
import {
  CommandCenterBills,
  CommandCenterBookingHistory,
  CommandCenterCurrentStay,
  CommandCenterFinancialSummary,
  CommandCenterPendingReviews,
  CommandCenterRefunds,
  CommandCenterRequests,
  CommandCenterVacating,
} from '@/src/components/admin/residents/command-center/CommandCenterSections';
import { CommandCenterTimeline } from '@/src/components/admin/residents/command-center/CommandCenterTimeline';
import { isMonthlyStayType } from '@/src/lib/stayType';
import type { ResidentCommandCenterData } from '@/src/lib/residents/commandCenterTypes';
import { getCheckoutSettlementDetailForBooking } from '@/src/services/checkoutSettlement';

type BedOption = { bedId: string; label: string };

export async function ResidentCommandCenter({
  data,
  bedOptions,
}: {
  data: ResidentCommandCenterData;
  bedOptions: BedOption[];
}) {
  const checkoutDetail =
    data.settledTenancy && data.isVacated
      ? await getCheckoutSettlementDetailForBooking(data.settledTenancy.bookingId)
      : null;

  return (
    <div className="space-y-6 pb-10">
      <CommandCenterPendingReviews data={data} />

      {data.isVacated ? (
        <>
          <CommandCenterFinancialSummary data={data} />
          <CommandCenterRefunds data={data} />
          <CommandCenterBookingHistory data={data} />
          <CommandCenterTimeline timeline={data.timeline} />
          {data.settledTenancy ? (
            <FinalSettlementPanel
              customerName={data.customer.fullName}
              settledTenancy={data.settledTenancy}
              depositWallet={data.depositSummary}
              checkoutDetail={checkoutDetail}
            />
          ) : null}
        </>
      ) : (
        <>
          <CommandCenterCurrentStay data={data} />
          <CommandCenterFinancialSummary data={data} />
          <CommandCenterQuickActions data={data} />
          <CommandCenterBills data={data} />
          <CommandCenterRefunds data={data} />
          <CommandCenterVacating data={data} />
          <CommandCenterRequests data={data} />
          <CommandCenterBookingHistory data={data} />
          <CommandCenterTimeline timeline={data.timeline} />

          {data.residencyView ? (
            <ResidentResidencyPanel
              residency={data.residencyView}
              depositHeldPaise={data.depositSummary?.refundableBalancePaise ?? null}
            />
          ) : null}
        </>
      )}

      <AdminAdvancedToolsSection
        title="Advanced tools"
        description="Bed edits, billing anchors, custom charges, and archive — use only when needed."
      >
        {data.activeTenancy ? (
          <div className="space-y-6">
            <EditMoveInDateForm
              bookingId={data.activeTenancy.bookingId}
              customerId={data.customer.id}
              currentMoveInDate={data.activeTenancy.moveInDate}
            />
            {data.billingDefaults &&
            isMonthlyStayType(data.activeTenancy.stayType) ? (
              <EditRentDueDateForm
                bookingId={data.activeTenancy.bookingId}
                customerId={data.customer.id}
                currentNextDueDate={data.billingDefaults.nextRentDueDate}
                billingDay={data.billingDefaults.billingDay}
              />
            ) : null}
            <div id="edit-tenancy">
              <EditTenantTenancyForm
                bookingId={data.activeTenancy.bookingId}
                customerId={data.customer.id}
                customerName={data.customer.fullName}
                customerPhone={data.customer.phone}
                currentBedId={data.activeTenancy.bedId}
                currentRoomLabel={`${data.activeTenancy.pgName} · Room ${data.activeTenancy.roomNumber} · ${data.activeTenancy.bedCode}`}
                blocksWholeRoom={data.activeTenancy.blocksRoomAvailability}
                beds={bedOptions}
              />
            </div>
          </div>
        ) : data.verification?.isVerified ? (
          <div id="assign-bed" className="scroll-mt-6">
            <h3 className="text-sm font-semibold text-white">Assign to a bed</h3>
            <p className="mt-2 max-w-xl text-sm text-apg-silver">
              Use the bed assignment command center to pick a PG, room, and bed.
            </p>
            <Link
              href={`/admin/beds?customerId=${data.customer.id}`}
              className="mt-4 inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Open bed assignment →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-apg-silver">
            Approve identity documents or confirm a payment first — then bed assignment unlocks.
          </p>
        )}

        {data.financialAccount && data.activeTenancy ? (
          <CreateChargeGeneratorForm
            customerId={data.customer.id}
            bookingId={data.activeTenancy.bookingId}
            billingDefaults={data.billingDefaults}
          />
        ) : null}

        {data.canArchive ? (
          <div className="border-t border-white/10 pt-4">
            <ArchiveResidentButton
              customerId={data.customer.id}
              customerName={data.customer.fullName}
            />
          </div>
        ) : null}
      </AdminAdvancedToolsSection>
    </div>
  );
}
