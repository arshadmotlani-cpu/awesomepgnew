'use client';

import { VacatingHome } from '@/src/components/customer/account/resident/vacating/VacatingHome';
import { ResidentHubShell } from '@/src/components/customer/account/ResidentHubShell';
import type { ResidentMoveOutStageVacatingHomeProps } from '@/src/lib/vacating/residentMoveOutStageFixtures';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000001';

export function ResidentMoveOutStagePreview({ cfg }: { cfg: ResidentMoveOutStageVacatingHomeProps }) {
  return (
    <ResidentHubShell activeTab="requests">
      <div className="mx-auto max-w-lg px-1 pb-8" data-move-out-stage={cfg.stage}>
        <VacatingHome
          bookingId={cfg.vacating.bookingId}
          bookingCode="APG-2026-0048"
          roomLabel="Room 203 · Bed B5"
          customerId={CUSTOMER_ID}
          vacating={cfg.vacating}
          checkoutStatus={cfg.checkoutStatus}
          checkoutSettlement={cfg.checkoutSettlement}
          settlementWaterfall={cfg.settlementWaterfall}
          totalRefundPaise={cfg.totalRefundPaise}
          payoutUpiId={cfg.payoutUpiId}
          refundPaidAt={cfg.refundPaidAt}
          depositHeldPaise={412_100}
          durationMode="monthly"
          monthlyRentPaise={150_000}
          estimatedSettlement={cfg.estimatedSettlement}
          settlementDocument={null}
          settlementNoticeDisplay={null}
        />
      </div>
    </ResidentHubShell>
  );
}
