'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AdminApprovalQueue, ApprovalSectionId } from '@/src/services/adminApprovalQueue';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import { buildApprovalDeepLink } from '@/src/lib/admin/approvalDeepLinks';
import { OperationsPaymentReviewsPanel } from '@/src/components/admin/operations/OperationsPaymentReviewsPanel';
import { paiseToInr } from '@/src/lib/format';

const ROW_HEIGHT = 76;

function ApprovalSectionList({
  items,
  onReview,
}: {
  items: PendingPaymentReviewItem[];
  onReview: (item: PendingPaymentReviewItem) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[min(420px,55vh)] overflow-y-auto rounded-xl border border-white/10 bg-[#141820]"
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]!;
          const roomBed = [
            item.roomNumber ? `Room ${item.roomNumber}` : null,
            item.bedCode ? `Bed ${item.bedCode}` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onReview(item)}
              className="absolute inset-x-0 flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 text-left transition hover:bg-white/5"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{item.residentName}</p>
                <p className="truncate text-xs text-apg-silver">
                  {item.pgName}
                  {roomBed ? ` · ${roomBed}` : ''}
                </p>
                <p className="truncate text-xs text-apg-silver">{item.paymentTypeLabel}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-white">{paiseToInr(item.amountPaise)}</p>
                <span className="text-xs font-medium text-apg-orange">Review →</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionAccordion({
  sectionId,
  label,
  count,
  items,
  defaultOpen,
  onReview,
}: {
  sectionId: ApprovalSectionId;
  label: string;
  count: number;
  items: PendingPaymentReviewItem[];
  defaultOpen: boolean;
  onReview: (item: PendingPaymentReviewItem) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#1A1F27]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-base font-semibold text-white">
          {open ? '▼' : '▶'} {label} ({count})
        </span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-4 pb-4 pt-3">
          <ApprovalSectionList items={items} onReview={onReview} />
        </div>
      ) : null}
    </section>
  );
}

export function WaitingForApprovalWorkspace({
  queue,
  initialSection,
  initialItemKey,
  openDialogInitially,
}: {
  queue: AdminApprovalQueue;
  initialSection: ApprovalSectionId | null;
  initialItemKey: string | null;
  openDialogInitially: boolean;
}) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<PendingPaymentReviewItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const itemByKey = useMemo(() => {
    const map = new Map<string, PendingPaymentReviewItem>();
    for (const item of queue.allItems) map.set(item.key, item);
    return map;
  }, [queue.allItems]);

  const openReview = useCallback((item: PendingPaymentReviewItem) => {
    setSelectedItem(item);
    setDialogOpen(true);
    const section = queue.sections.find((s) => s.items.some((row) => row.key === item.key))?.id;
    if (section) {
      const href = buildApprovalDeepLink({ section, itemKey: item.key });
      router.replace(href, { scroll: false });
    }
  }, [queue.sections, router]);

  useEffect(() => {
    if (!initialItemKey) return;
    const item = itemByKey.get(initialItemKey);
    if (!item) return;
    setSelectedItem(item);
    if (openDialogInitially) setDialogOpen(true);
  }, [initialItemKey, itemByKey, openDialogInitially]);

  function closeDialog() {
    setDialogOpen(false);
    setSelectedItem(null);
    router.replace('/admin/operations?tab=waiting', { scroll: false });
  }

  if (queue.totalCount === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-[#1A1F27] px-6 py-10 text-center">
        <h2 className="text-lg font-semibold text-white">Waiting For Approval (0)</h2>
        <p className="mt-2 text-sm text-apg-silver">
          No payment proofs waiting for review. Items appear here after residents upload proof.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#1A1F27] px-6 py-5">
        <h2 className="text-2xl font-semibold text-white">
          Waiting For Approval ({queue.totalCount})
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-apg-silver">
          Every pending approval is listed below. Expand a section, pick a resident, and review in
          one click.
        </p>
      </div>

      <div className="space-y-3">
        {queue.sections.map((section) => (
          <SectionAccordion
            key={section.id}
            sectionId={section.id}
            label={section.label}
            count={section.count}
            items={section.items}
            defaultOpen={initialSection ? section.id === initialSection : section.count > 0}
            onReview={openReview}
          />
        ))}
      </div>

      {dialogOpen && selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-[#141820] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Payment approval review"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#141820] px-5 py-4">
              <h3 className="text-lg font-semibold text-white">Review payment proof</h3>
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-apg-silver hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <OperationsPaymentReviewsPanel
                items={[selectedItem]}
                reviewMode={false}
                onCompleted={closeDialog}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
