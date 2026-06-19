'use client';

import Link from 'next/link';
import { StatusTimeline, type TimelineStage } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { accountProfileHref, residentTabHref } from '@/src/lib/accountNavigation';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';

const APPLICATION_STAGES: TimelineStage[] = [
  { id: 'account', label: 'Account ready', description: 'Your name and phone are saved' },
  { id: 'kyc', label: 'Identity uploaded', description: 'Aadhaar and selfie submitted' },
  { id: 'kyc_approved', label: 'Identity approved', description: 'Team verified your documents' },
  { id: 'bed', label: 'Bed confirmed', description: 'Your room and bed are assigned' },
  { id: 'deposit', label: 'Deposit paid', description: 'Security deposit received' },
  { id: 'move_in', label: 'Moved in', description: 'You can use the resident home' },
];

type Props = {
  profileComplete: boolean;
  kycStatus: string;
  hasConfirmedBooking: boolean;
  depositPaid: boolean;
  isResident: boolean;
};

function stageIndex(props: Props): number {
  if (props.isResident && props.depositPaid) return 6;
  if (props.hasConfirmedBooking && props.depositPaid) return 5;
  if (props.hasConfirmedBooking) return 4;
  if (props.kycStatus === 'approved') return 3;
  if (props.kycStatus === 'pending') return 2;
  if (props.profileComplete) return 1;
  return 0;
}

function nextStepLabel(props: Props): { label: string; href: string } {
  if (!props.profileComplete) {
    return { label: 'Complete your profile', href: accountProfileHref('profile') };
  }
  if (props.kycStatus !== 'approved') {
    return { label: 'Complete identity check', href: accountProfileHref('identity') };
  }
  if (!props.hasConfirmedBooking) {
    return { label: 'Browse PGs to book', href: '/pgs' };
  }
  if (!props.depositPaid) {
    return { label: 'Pay security deposit', href: residentTabHref('wallet') };
  }
  if (!props.isResident) {
    return { label: 'Open resident home', href: residentTabHref('home') };
  }
  return { label: 'Go to resident home', href: residentTabHref('home') };
}

export function ApplicationStatusTracker(props: Props) {
  const activeIndex = stageIndex(props);
  const unlocked = props.isResident;
  const next = nextStepLabel(props);
  const waitingStage = APPLICATION_STAGES[Math.min(activeIndex, APPLICATION_STAGES.length - 1)];

  return (
    <ApgCard tier="account" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Your move-in journey</h2>
          <p className="mt-1 text-sm text-zinc-600">
            See what is done, what we are waiting on, and what to do next.
          </p>
        </div>
        {unlocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Resident home unlocked
          </span>
        ) : null}
      </div>

      <section className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h3 className="text-sm font-semibold text-zinc-900">What to do next</h3>
        <p className="mt-1 text-xs text-zinc-600">
          {unlocked
            ? 'You are moved in. Use resident home for rent, bills, and requests.'
            : `Waiting on: ${waitingStage.label.toLowerCase()}.`}
        </p>
        <Link
          href={next.href}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
        >
          {next.label}
        </Link>
      </section>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <dt className="text-[10px] font-medium uppercase text-zinc-500">Completed</dt>
          <dd className="mt-1 font-semibold text-zinc-900">{activeIndex} of 6</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <dt className="text-[10px] font-medium uppercase text-zinc-500">Identity</dt>
          <dd className="mt-1 font-semibold text-zinc-900 capitalize">{props.kycStatus.replace(/_/g, ' ')}</dd>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3 col-span-2 sm:col-span-1">
          <dt className="text-[10px] font-medium uppercase text-zinc-500">
            <GlossaryTip term="One-time payment held until you move out, then refunded minus any charges.">
              Deposit
            </GlossaryTip>
          </dt>
          <dd className="mt-1 font-semibold text-zinc-900">{props.depositPaid ? 'Paid' : 'Pending'}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">Step by step</h3>
        <StatusTimeline
          stages={APPLICATION_STAGES}
          activeIndex={Math.min(activeIndex, APPLICATION_STAGES.length - 1)}
          orientation="vertical"
        />
      </div>
    </ApgCard>
  );
}
