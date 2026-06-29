'use client';

import { useEffect, useMemo } from 'react';
import {
  buildRefundRequestPageModel,
  type RefundRequestBookingInput,
  type RefundRequestSettlementInput,
} from '@/src/lib/refund/refundRequestValidation';
import { logResidentClientInfo } from '@/src/lib/client/residentClientLogger';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { DepositRefundRequestFlow } from '@/src/components/customer/account/resident/requests/DepositRefundRequestFlow';

type Props = {
  customerId?: string | null;
  booking: RefundRequestBookingInput;
  vacating: VacatingForBookingRow | null;
  settlement: RefundRequestSettlementInput;
  developerTestEmail?: string | null;
  onBack: () => void;
};

export function RefundRequestPageGuard({
  customerId,
  booking,
  vacating,
  settlement,
  developerTestEmail = null,
  onBack,
}: Props) {
  const model = useMemo(
    () =>
      buildRefundRequestPageModel({
        booking,
        vacating,
        settlement,
        developerTestEmail,
      }),
    [booking, vacating, settlement, developerTestEmail],
  );

  useEffect(() => {
    logResidentClientInfo('refund request page opened', {
      page: 'refund_request',
      bookingId: model.bookingId,
      customerId: customerId ?? undefined,
      email: developerTestEmail ?? undefined,
      durationMode: model.durationMode,
      extra: {
        stayKind: model.stayKind,
        canRenderForm: model.canRenderForm,
        unlockState: model.eligibility.unlockState,
        settlementStatus: settlement?.status ?? null,
      },
    });
  }, [customerId, developerTestEmail, model, settlement?.status]);

  if (!model.canRenderForm) {
    return (
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
        <p className="text-sm font-medium text-zinc-900">Refund request unavailable</p>
        <p className="text-sm text-zinc-600">
          {model.blockedMessage ??
            'We cannot open the refund form right now. Please try again later.'}
        </p>
        {model.missingRequirements.length > 0 ? (
          <p className="text-xs text-zinc-500">
            Missing: {model.missingRequirements.join(', ')}
          </p>
        ) : null}
        {model.rejectionReason ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Previous feedback: {model.rejectionReason}
          </p>
        ) : null}
        <button type="button" onClick={onBack} className="text-sm font-semibold text-indigo-600">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <DepositRefundRequestFlow
      bookingId={model.bookingId}
      customerId={customerId ?? undefined}
      refundableBalancePaise={model.refundableBalancePaise}
      estimatedDeductionPaise={model.estimatedDeductionPaise}
      rejectionReason={model.rejectionReason}
      onDone={onBack}
      onBack={onBack}
    />
  );
}
