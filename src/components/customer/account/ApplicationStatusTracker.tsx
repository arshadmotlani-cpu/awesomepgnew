'use client';

import Link from 'next/link';
import { StatusTimeline, type TimelineStage } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { accountProfileHref, residentTabHref } from '@/src/lib/accountNavigation';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';

const APPLICATION_STAGES: TimelineStage[] = [
  { id: 'applicant', label: 'Applicant', description: 'Book a PG and share your details' },
  { id: 'verified', label: 'Verified', description: 'Our team approved your identity' },
  { id: 'assigned', label: 'Assigned', description: 'Your bed and room are confirmed' },
  { id: 'move_in', label: 'Moved in', description: 'Pay bills and raise requests from resident home' },
];

type Props = {
  profileComplete: boolean;
  kycStatus: string;
  hasConfirmedBooking: boolean;
  depositPaid: boolean;
  isResident: boolean;
};

function stageIndex(props: Props): number {
  if (props.isResident) return 3;
  if (props.hasConfirmedBooking) return 2;
  if (props.kycStatus === 'approved') return 1;
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
    return { label: 'Pay security deposit', href: residentTabHref('payments') };
  }
  if (!props.isResident) {
    return { label: 'Open resident home', href: residentTabHref('home') };
  }
  return { label: 'Go to resident home', href: residentTabHref('home') };
}

function waitingOnAdmin(props: Props): string | null {
  if (props.kycStatus === 'pending') {
    return 'Our team is reviewing your identity documents.';
  }
  if (props.hasConfirmedBooking && !props.isResident && props.kycStatus === 'approved') {
    return 'Your booking is confirmed — complete deposit payment to finish move-in.';
  }
  return null;
}

export function ApplicationStatusTracker(props: Props) {
  const activeIndex = stageIndex(props);
  const unlocked = props.isResident;
  const next = nextStepLabel(props);
  const adminWait = waitingOnAdmin(props);
  const currentStage = APPLICATION_STAGES[activeIndex];

  return (
    <ApgCard tier="account" className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Where you are
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-900">
            {currentStage.label}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">{currentStage.description}</p>
        </div>
        {unlocked ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Moved in
          </span>
        ) : null}
      </div>

      {adminWait ? (
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">
            Waiting on admin
          </p>
          <p className="mt-1 text-sm text-sky-900">{adminWait}</p>
        </div>
      ) : null}

      <section className="mt-5 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h3 className="text-sm font-semibold text-zinc-900">What to do next</h3>
        <p className="mt-1 text-xs text-zinc-600">
          {unlocked
            ? 'You are moved in. Use resident home for rent, bills, and requests.'
            : `Next step toward move-in.`}
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
          <dt className="text-[10px] font-medium uppercase text-zinc-500">Progress</dt>
          <dd className="mt-1 font-semibold text-zinc-900">
            {activeIndex + 1} of {APPLICATION_STAGES.length}
          </dd>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-3">
          <dt className="text-[10px] font-medium uppercase text-zinc-500">Identity</dt>
          <dd className="mt-1 font-semibold capitalize text-zinc-900">
            {props.kycStatus === 'approved'
              ? 'Verified'
              : props.kycStatus === 'pending'
                ? 'In review'
                : 'Not done'}
          </dd>
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
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">Your journey</h3>
        <StatusTimeline
          stages={APPLICATION_STAGES}
          activeIndex={activeIndex}
          orientation="vertical"
        />
      </div>
    </ApgCard>
  );
}
