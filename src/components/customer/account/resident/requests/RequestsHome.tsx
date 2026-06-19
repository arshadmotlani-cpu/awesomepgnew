'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { RequestsMakeFlow } from '@/src/components/customer/account/resident/requests/RequestsMakeFlow';
import { RequestDetailView } from '@/src/components/customer/account/resident/requests/RequestDetailView';
import {
  REQUEST_CATEGORIES,
  type ActiveRequestItem,
} from '@/src/lib/residents/requestCenter';
import { accountProfileHref, residentTabHref } from '@/src/lib/accountNavigation';

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white hover:brightness-110';

type Props = {
  bookingId: string;
  roomLabel: string;
  refundableBalancePaise: number;
  hasDepositDue: boolean;
  activeRequests: ActiveRequestItem[];
  selectedRequestId: string | null;
  startMake: boolean;
  initialCategory?: import('@/src/lib/residents/requestCenter').RequestCategoryId | null;
};

export function RequestsHome({
  bookingId,
  roomLabel,
  refundableBalancePaise,
  hasDepositDue,
  activeRequests,
  selectedRequestId,
  startMake,
  initialCategory = null,
}: Props) {
  const router = useRouter();
  const [making, setMaking] = useState(startMake);
  const [makeCategory, setMakeCategory] = useState(initialCategory);

  const selected = useMemo(
    () => activeRequests.find((r) => r.id === selectedRequestId) ?? null,
    [activeRequests, selectedRequestId],
  );

  const visibleCategories = REQUEST_CATEGORIES.filter((c) => c.primaryVisible);
  const moreCategories = REQUEST_CATEGORIES.filter((c) => !c.primaryVisible);

  function openDetail(id: string) {
    router.push(accountProfileHref('resident', { tab: 'requests', request: id }));
  }

  function closeDetail() {
    router.push(residentTabHref('requests'));
  }

  if (selected) {
    return <RequestDetailView request={selected} onBack={closeDetail} />;
  }

  if (making) {
    return (
      <RequestsMakeFlow
        bookingId={bookingId}
        roomLabel={roomLabel}
        refundableBalancePaise={refundableBalancePaise}
        hasDepositDue={hasDepositDue}
        initialCategory={makeCategory}
        onClose={() => {
          setMaking(false);
          setMakeCategory(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-2">
      <button type="button" onClick={() => setMaking(true)} className={PRIMARY_BTN}>
        Make a request
      </button>

      {activeRequests.length > 0 ? (
        <ApgCard tier="account" className="p-5">
          <h2 className="text-sm font-semibold text-zinc-900">Active requests</h2>
          <p className="mt-1 text-xs text-zinc-600">Tap to see progress and next steps.</p>
          <ul className="mt-3 space-y-2">
            {activeRequests.slice(0, 3).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => openDetail(r.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left hover:border-[#FF5A1F]/30"
                >
                  <span className="text-sm font-medium text-zinc-900">{r.typeLabel}</span>
                  <StatusChip status={r.status} />
                </button>
              </li>
            ))}
          </ul>
          {activeRequests.length > 3 ? (
            <p className="mt-2 text-xs text-zinc-500">+{activeRequests.length - 3} more open</p>
          ) : null}
        </ApgCard>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-900">Request types</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              title={cat.title}
              description={cat.description}
              onSelect={() => {
                if (cat.wired === 'vacating') {
                  router.push(`/account/resident/request-vacating/${bookingId}`);
                  return;
                }
                setMakeCategory(cat.id);
                setMaking(true);
              }}
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
              onSelect={() => {
                setMakeCategory(cat.id);
                setMaking(true);
              }}
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
}: {
  title: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-xl border border-zinc-200 bg-white p-4 text-left hover:border-[#FF5A1F]/30 hover:bg-zinc-50"
    >
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-xs text-zinc-600">{description}</p>
    </button>
  );
}
