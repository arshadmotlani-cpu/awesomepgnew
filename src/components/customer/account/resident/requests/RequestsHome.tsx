'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { RequestsMakeFlow } from '@/src/components/customer/account/resident/requests/RequestsMakeFlow';
import { RequestDetailView } from '@/src/components/customer/account/resident/requests/RequestDetailView';
import { ResidentSectionErrorBoundary } from '@/src/components/customer/account/resident/ResidentSectionErrorBoundary';
import {
  nextStepForRequest,
  REQUEST_CATEGORIES,
  REQUEST_TIMELINE_STAGES,
  requestStatusToTimelineIndex,
  type ActiveRequestItem,
  type RequestCategoryId,
} from '@/src/lib/residents/requestCenter';
import { accountProfileHref, residentTabHref } from '@/src/lib/accountNavigation';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';

type Props = {
  customerId: string;
  bookingId: string;
  bookingCode?: string | null;
  roomLabel: string;
  refundableBalancePaise: number;
  hasDepositDue: boolean;
  activeRequests: ActiveRequestItem[];
  selectedRequestId: string | null;
  startMake: boolean;
  initialCategory?: RequestCategoryId | null;
  vacating: VacatingForBookingRow | null;
  bookingStatus?: string;
  durationMode?: string;
  expectedCheckoutDate?: string | null;
  bookingCreatedAt?: Date | string;
  checkoutSettlementStatus?: string | null;
  checkoutSettlement?: { status: string; rejectionReason?: string | null } | null;
  monthlyRentPaise?: number;
  developerTestEmail?: string | null;
};

export function RequestsHome({
  customerId,
  bookingId,
  bookingCode = null,
  roomLabel,
  refundableBalancePaise,
  hasDepositDue,
  activeRequests,
  selectedRequestId,
  startMake,
  initialCategory = null,
  vacating,
  bookingStatus = 'confirmed',
  durationMode = 'monthly',
  expectedCheckoutDate = null,
  bookingCreatedAt,
  checkoutSettlementStatus = null,
  checkoutSettlement = null,
  monthlyRentPaise = 0,
  developerTestEmail = null,
}: Props) {
  const router = useRouter();
  const [making, setMaking] = useState(startMake);
  const [makeCategory, setMakeCategory] = useState(initialCategory);

  const selected = useMemo(
    () => activeRequests.find((r) => r.id === selectedRequestId) ?? null,
    [activeRequests, selectedRequestId],
  );

  useEffect(() => {
    if (selected?.type === 'deposit_refund') {
      router.replace(residentTabHref('wallet'));
    }
  }, [selected, router]);

  useEffect(() => {
    if (initialCategory === 'deposit_refund' || makeCategory === 'deposit_refund') {
      router.replace(residentTabHref('wallet'));
    }
  }, [initialCategory, makeCategory, router]);

  const visibleCategories = REQUEST_CATEGORIES.filter((c) => c.primaryVisible);
  const moreCategories = REQUEST_CATEGORIES.filter(
    (c) => !c.primaryVisible && c.id !== 'deposit_refund',
  );

  function openDetail(id: string) {
    const request = activeRequests.find((r) => r.id === id);
    if (request?.type === 'deposit_refund') {
      router.push(residentTabHref('wallet'));
      return;
    }
    router.push(accountProfileHref('resident', { tab: 'requests', request: id }));
  }

  function closeDetail() {
    router.push(residentTabHref('requests'));
  }

  function selectCategory(id: RequestCategoryId) {
    const cat = REQUEST_CATEGORIES.find((c) => c.id === id);
    if (!cat) return;
    if (cat.wired === 'vacating') {
      router.push(`/account/resident/request-vacating/${bookingId}`);
      return;
    }
    if (cat.wired === 'deposit_refund') {
      router.push(residentTabHref('wallet'));
      return;
    }
    setMakeCategory(id);
    setMaking(true);
  }

  if (selected) {
    return <RequestDetailView request={selected} onBack={closeDetail} />;
  }

  if (making) {
    if (makeCategory === 'deposit_refund') {
      return null;
    }

    return (
      <ResidentSectionErrorBoundary
        page="requests_make_refund"
        bookingId={bookingId}
        customerId={customerId}
        title="Refund request could not load"
      >
        <RequestsMakeFlow
          customerId={customerId}
          bookingId={bookingId}
          bookingCode={bookingCode}
          roomLabel={roomLabel}
          refundableBalancePaise={refundableBalancePaise}
          hasDepositDue={hasDepositDue}
          initialCategory={makeCategory}
          vacating={vacating}
          bookingStatus={bookingStatus}
          durationMode={durationMode}
          expectedCheckoutDate={expectedCheckoutDate}
          bookingCreatedAt={bookingCreatedAt}
          checkoutSettlement={checkoutSettlement}
          monthlyRentPaise={monthlyRentPaise}
          developerTestEmail={developerTestEmail}
          onClose={() => {
            setMaking(false);
            setMakeCategory(null);
          }}
        />
      </ResidentSectionErrorBoundary>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="account" className="p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Requests center</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Tell us what you need — maintenance, room change, move-out, and more. Every request has a
          status tracker so you know what happens next.
        </p>
      </ApgCard>

      {activeRequests.length > 0 ? (
        <ApgCard tier="account" className="p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Open requests</h2>
          <p className="mt-1 text-xs text-zinc-600">Tap to see full progress and next steps.</p>
          <ul className="mt-3 space-y-3">
            {activeRequests.slice(0, 5).map((r) => {
              const stepIndex = requestStatusToTimelineIndex(r.status);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(r.id)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-left hover:border-[#FF5A1F]/30"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-zinc-900">{r.typeLabel}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <p className="mt-2 text-xs text-zinc-600">
                      {nextStepForRequest(r.status, r.type)}
                    </p>
                    <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                      Step {stepIndex + 1} of {REQUEST_TIMELINE_STAGES.length}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </ApgCard>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Start a request</h2>
        <p className="mb-3 text-xs text-zinc-600">Pick a category — we guide you through each step.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              title={cat.title}
              description={cat.description}
              onSelect={() => selectCategory(cat.id)}
            />
          ))}
        </div>
      </section>

      <ResidentMoreSection title="More request types" description="Less common requests.">
        <div className="grid gap-2 sm:grid-cols-2">
          {moreCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              title={cat.title}
              description={cat.description}
              onSelect={() => selectCategory(cat.id)}
            />
          ))}
        </div>
      </ResidentMoreSection>

      <p className="text-center text-xs text-zinc-500">
        <Link href={residentTabHref('home')} className="font-medium text-indigo-700 hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}

function CategoryCard({
  title,
  description,
  onSelect,
  disabled = false,
  lockReason,
}: {
  title: string;
  description: string;
  onSelect: () => void;
  disabled?: boolean;
  lockReason?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-[#FF5A1F]/35 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
    >
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">{description}</p>
      {disabled && lockReason ? (
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">{lockReason}</p>
      ) : null}
    </button>
  );
}
