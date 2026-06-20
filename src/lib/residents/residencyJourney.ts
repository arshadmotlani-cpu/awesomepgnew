import { accountProfileHref } from '@/src/lib/accountNavigation';

export type JourneyStepId =
  | 'account'
  | 'kyc'
  | 'bed'
  | 'deposit'
  | 'active_stay';

export type JourneyStepStatus = 'done' | 'pending' | 'locked';

export type JourneyStep = {
  id: JourneyStepId;
  label: string;
  status: JourneyStepStatus;
};

export type ResidencyJourneyState = {
  steps: JourneyStep[];
  nextActionLabel: string;
  nextActionHref: string;
  waitingFor: string;
  residentStatusLabel: string;
};

export function deriveResidentStatusLabel(input: {
  residencyStatus: string;
  hasConfirmedBooking: boolean;
  isActiveStay: boolean;
  depositOutstandingPaise: number;
}): string {
  if (input.residencyStatus === 'vacated') return 'Moved out';
  if (input.isActiveStay) return 'Checked-in';
  if (input.hasConfirmedBooking && input.depositOutstandingPaise > 0) return 'Pending deposit';
  if (input.hasConfirmedBooking) return 'Pending bed';
  return 'Pending bed';
}

export function deriveResidencyJourney(input: {
  profileComplete: boolean;
  kycStatus: string;
  hasConfirmedBooking: boolean;
  depositPaid: boolean;
  isActiveStay: boolean;
  residencyStatus: string;
  depositOutstandingPaise: number;
}): ResidencyJourneyState {
  const kycDone = input.kycStatus === 'approved';
  const kycPending = input.kycStatus === 'pending';

  const steps: JourneyStep[] = [
    {
      id: 'account',
      label: 'Account Created',
      status: input.profileComplete ? 'done' : 'pending',
    },
    {
      id: 'kyc',
      label: 'Identity Verified (KYC)',
      status: kycDone ? 'done' : kycPending ? 'pending' : input.profileComplete ? 'pending' : 'locked',
    },
    {
      id: 'bed',
      label: 'Bed Assignment',
      status: input.hasConfirmedBooking ? 'done' : kycDone ? 'pending' : 'locked',
    },
    {
      id: 'deposit',
      label: 'Deposit Payment',
      status: input.depositPaid ? 'done' : input.hasConfirmedBooking ? 'pending' : 'locked',
    },
    {
      id: 'active_stay',
      label: 'Active Stay',
      status: input.isActiveStay ? 'done' : input.depositPaid ? 'pending' : 'locked',
    },
  ];

  let nextActionLabel = 'Browse PGs to book';
  let nextActionHref = '/pgs';
  let waitingFor = 'Bed confirmation';

  if (!input.profileComplete) {
    nextActionLabel = 'Complete profile';
    nextActionHref = accountProfileHref('profile', { section: 'profile' }) + '#profile';
    waitingFor = 'Profile details';
  } else if (!kycDone) {
    nextActionLabel = 'Complete identity verification';
    nextActionHref = accountProfileHref('identity') + '#documents';
    waitingFor = 'Identity verification (KYC)';
  } else if (!input.hasConfirmedBooking) {
    nextActionLabel = 'Browse PGs to book';
    nextActionHref = '/pgs';
    waitingFor = 'Bed confirmation';
  } else if (!input.depositPaid) {
    nextActionLabel = 'Pay security deposit';
    nextActionHref = accountProfileHref('profile') + '#deposit';
    waitingFor = 'Deposit payment';
  } else if (!input.isActiveStay) {
    nextActionLabel = 'View billing overview';
    nextActionHref = accountProfileHref('profile') + '#billing';
    waitingFor = 'Move-in confirmation';
  } else {
    nextActionLabel = 'View current bills';
    nextActionHref = accountProfileHref('profile') + '#invoices';
    waitingFor = 'Nothing — you are checked in';
  }

  const residentStatusLabel = deriveResidentStatusLabel({
    residencyStatus: input.residencyStatus,
    hasConfirmedBooking: input.hasConfirmedBooking,
    isActiveStay: input.isActiveStay,
    depositOutstandingPaise: input.depositOutstandingPaise,
  });

  return {
    steps,
    nextActionLabel,
    nextActionHref,
    waitingFor,
    residentStatusLabel,
  };
}
