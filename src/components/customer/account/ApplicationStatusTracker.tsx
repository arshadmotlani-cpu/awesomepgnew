'use client';

import { StatusTimeline, type TimelineStage } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';

const APPLICATION_STAGES: TimelineStage[] = [
  { id: 'account', label: 'Account created', description: 'Profile and contact details' },
  { id: 'kyc', label: 'KYC submitted', description: 'Identity documents uploaded' },
  { id: 'kyc_approved', label: 'KYC approved', description: 'Verified by our team' },
  { id: 'bed', label: 'Bed assigned', description: 'Booking confirmed with your bed' },
  { id: 'deposit', label: 'Deposit paid', description: 'Security deposit collected' },
  { id: 'move_in', label: 'Move in', description: 'Welcome to Resident Hub' },
];

type Props = {
  profileComplete: boolean;
  kycStatus: string;
  hasConfirmedBooking: boolean;
  depositPaid: boolean;
  isResident: boolean;
};

function stageIndex({
  profileComplete,
  kycStatus,
  hasConfirmedBooking,
  depositPaid,
  isResident,
}: Props): number {
  if (isResident && depositPaid) return 6;
  if (hasConfirmedBooking && depositPaid) return 5;
  if (hasConfirmedBooking) return 4;
  if (kycStatus === 'approved') return 3;
  if (kycStatus === 'pending') return 2;
  if (profileComplete) return 1;
  return 0;
}

export function ApplicationStatusTracker(props: Props) {
  const activeIndex = stageIndex(props);
  const unlocked = props.isResident;

  return (
    <ApgCard tier="account" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Application progress</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Track your journey from signup to move-in. Each step unlocks the next.
          </p>
        </div>
        {unlocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <span aria-hidden>🎉</span> Resident Hub unlocked
          </span>
        ) : null}
      </div>
      <div className="mt-6">
        <StatusTimeline
          stages={APPLICATION_STAGES}
          activeIndex={Math.min(activeIndex, APPLICATION_STAGES.length - 1)}
          orientation="vertical"
        />
      </div>
    </ApgCard>
  );
}
