'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ApproveVacatingButton,
  CancelVacatingNoticeButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
} from '@/src/components/admin/VacatingActions';
import { NoticeDeductionBreakdown } from '@/src/components/shared/NoticeDeductionBreakdown';
import { formatDate, formatDateTime, paiseToInr } from '@/src/lib/format';
import { breakdownFromStoredNoticeSnapshot } from '@/src/lib/vacating/noticeDeductionPresentation';
import { tryDiffDays, normalizeIsoDateOnly } from '@/src/lib/dates';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import type { MoveOutUrgency } from '@/src/lib/vacating/approvalPreview';
import {
  MOVE_OUT_STAGES,
  type MoveOutPipelineItemClient,
} from '@/src/lib/moveOut/moveOutPipeline';
import {
  moveOutHeroSubtitle,
  moveOutHeroTitle,
  moveOutIsZeroRefundCheckout,
  moveOutMatchesFilter,
  moveOutOverdueDays,
  moveOutPendingApprovalItems,
  moveOutPrimaryActionLabel,
  partitionMoveOutItems,
  type MoveOutFilterBucket,
} from '@/src/lib/moveOut/moveOutPipelineUi';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110';

const LINK =
  'text-xs font-medium text-apg-silver underline-offset-2 hover:text-white hover:underline';

const URGENCY_RING: Record<MoveOutUrgency, string> = {
  high: 'ring-rose-400/30',
  medium: 'ring-amber-400/25',
  normal: 'ring-white/10',
};

export function MoveOutPipelineQueue({
  items,
  filter = 'all',
  completedSection,
}: {
  items: MoveOutPipelineItemClient[];
  filter?: MoveOutFilterBucket;
  /** When true, render as a completed-only section (no overdue split). */
  completedSection?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => items.filter((item) => moveOutMatchesFilter(item, filter)),
    [items, filter],
  );

  const { overdue, active, pendingApproval } = useMemo(() => {
    if (completedSection || filter === 'completed') {
      return {
        overdue: [] as MoveOutPipelineItemClient[],
        active: filtered,
        pendingApproval: [] as MoveOutPipelineItemClient[],
      };
    }
    if (filter === 'overdue') {
      return {
        overdue: filtered,
        active: [] as MoveOutPipelineItemClient[],
        pendingApproval: [] as MoveOutPipelineItemClient[],
      };
    }
    const pending = moveOutPendingApprovalItems(filtered);
    const pendingIds = new Set(pending.map((p) => p.id));
    const partitioned = partitionMoveOutItems(filtered.filter((i) => !pendingIds.has(i.id)));
    if (filter !== 'all' && filter !== 'needs_action') {
      return { overdue: partitioned.overdue, active: partitioned.active, pendingApproval: [] };
    }
    return {
      overdue: partitioned.overdue,
      active: partitioned.active,
      pendingApproval: pending,
    };
  }, [filtered, filter, completedSection]);

  if (items.length === 0) {
    if (completedSection) return null;
    return (
      <section className="mb-8 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-emerald-100">No active move-outs</h2>
        <p className="mt-2 text-sm text-emerald-200/90">
          All move-outs are complete or none have been submitted. Residents submit notice from their
          account.
        </p>
      </section>
    );
  }

  if (filtered.length === 0) {
    return (
      <section className="mb-8 rounded-xl border border-white/10 bg-[#1A1F27] p-8 text-center">
        <p className="text-sm text-apg-silver">No move-outs match this filter.</p>
      </section>
    );
  }

  return (
    <section className="mb-8 space-y-6">
      {!completedSection && pendingApproval.length > 0 ? (
        <div>
          <SectionHeader title="Awaiting approval" count={pendingApproval.length} tone="pending" />
          <div className="space-y-2">
            {pendingApproval.map((row) => (
              <MoveOutCard
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => setExpandedId((id) => (id === row.id ? null : row.id))}
              />
            ))}
          </div>
        </div>
      ) : null}

      {!completedSection && overdue.length > 0 ? (
        <div>
          <SectionHeader title="Overdue" count={overdue.length} tone="overdue" />
          <div className="space-y-2">
            {overdue.map((row) => (
              <MoveOutCard
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                showOverdueMeta
              />
            ))}
          </div>
        </div>
      ) : null}

      {active.length > 0 ? (
        <div>
          {!completedSection ? (
            <SectionHeader
              title={completedSection ? 'Recently completed' : 'Move-outs'}
              count={active.length}
            />
          ) : null}
          <div className="space-y-2">
            {active.map((row) => (
              <MoveOutCard
                key={row.id}
                row={row}
                expanded={expandedId === row.id}
                onToggle={() => setExpandedId((id) => (id === row.id ? null : row.id))}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SectionHeader({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone?: 'overdue' | 'pending';
}) {
  return (
    <header className="mb-3 flex items-baseline gap-2">
      <h3
        className={
          'text-sm font-bold uppercase tracking-wide ' +
          (tone === 'overdue'
            ? 'text-rose-200'
            : tone === 'pending'
              ? 'text-amber-200'
              : 'text-white')
        }
      >
        {title}
      </h3>
      <span className="text-sm font-semibold text-apg-silver">({count})</span>
    </header>
  );
}

function MoveOutCard({
  row,
  expanded,
  onToggle,
  showOverdueMeta,
}: {
  row: MoveOutPipelineItemClient;
  expanded: boolean;
  onToggle: () => void;
  showOverdueMeta?: boolean;
}) {
  const actionLabel = moveOutPrimaryActionLabel(row);
  const isComplete = row.stage === 'bed_released';
  const overdueDays = moveOutOverdueDays(row);

  return (
    <article
      className={
        'overflow-hidden rounded-xl border bg-[#1A1F27] ring-1 ring-inset ' +
        URGENCY_RING[row.urgency]
      }
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 text-left hover:bg-white/[0.02]"
        aria-expanded={expanded}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">
              {row.customerFullName}
              <span className="mx-1.5 text-apg-silver/60">•</span>
              <span className="font-normal text-apg-silver">
                {row.roomNumber}-{row.bedCode}
              </span>
              <span className="mx-1.5 text-apg-silver/60">•</span>
              <span
                className={
                  row.estimatedRefundPaise === 0 ? 'text-apg-silver' : 'text-emerald-200/90'
                }
              >
                Refund {paiseToInr(row.estimatedRefundPaise)}
              </span>
            </p>
            {showOverdueMeta ? (
              <p className="mt-1 text-xs text-rose-200/90">
                {formatDate(row.vacatingDate)}
                {overdueDays > 0 ? ` · ${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue` : ''}
              </p>
            ) : null}
            {!isComplete ? (
              <p className="mt-1.5 text-xs text-apg-silver">
                <span className="font-semibold uppercase tracking-wide text-apg-silver/80">
                  Next:
                </span>{' '}
                {moveOutHeroTitle(row)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!expanded ? <MoveOutPrimaryButton row={row} label={actionLabel} /> : null}
            <span className="text-apg-silver/60">{expanded ? '▴' : '▾'}</span>
          </div>
        </div>
        <FinancialSummary row={row} className="mt-3" />
      </button>

      {expanded ? (
        <div className="border-t border-white/10 px-4 pb-4 pt-3">
          {!isComplete ? (
            <NextActionHero row={row} actionLabel={actionLabel} />
          ) : (
            <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/80">
                Move-out complete
              </p>
              <p className="mt-1 text-sm text-emerald-100">Bed released and checkout closed.</p>
            </div>
          )}

          <div className="mb-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
              Progress
            </p>
            <StageProgress stageIndex={row.stageIndex} />
            <StageTimeline row={row} />
          </div>

          {row.deductionPaise > 0 ? (
            <div className="mb-4">
              {(() => {
                const breakdown = breakdownFromStoredNoticeSnapshot({
                  noticeGivenDate: row.noticeGivenDate,
                  vacatingDate: row.vacatingDate,
                  noticeGivenDays: noticeCompletedDaysForRow(row),
                  noticeShortfallDays: Math.max(
                    0,
                    VACATING_NOTICE_MIN_DAYS - noticeCompletedDaysForRow(row),
                  ),
                  noticeRentCoveredDays: row.noticeRentCoveredDays,
                  noticeChargeableDays: row.noticeChargeableDays,
                  deductionPaise: row.deductionPaise,
                });
                return breakdown ? (
                  <NoticeDeductionBreakdown breakdown={breakdown} variant="admin" compact />
                ) : null;
              })()}
            </div>
          ) : null}

          <DirectLinks row={row} />
          <DangerActions row={row} />
        </div>
      ) : null}
    </article>
  );
}

function FinancialSummary({
  row,
  className = '',
}: {
  row: MoveOutPipelineItemClient;
  className?: string;
}) {
  return (
    <dl
      className={
        'flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums ' + className
      }
    >
      <div>
        <dt className="inline text-apg-silver">Deposit </dt>
        <dd className="inline text-white">{paiseToInr(row.depositHeldPaise)}</dd>
      </div>
      {row.deductionPaise > 0 ? (
        <div>
          <dt className="inline text-apg-silver">Notice </dt>
          <dd className="inline text-rose-200/90">-{paiseToInr(row.deductionPaise)}</dd>
        </div>
      ) : null}
      {row.electricityDeductionPaise > 0 ? (
        <div>
          <dt className="inline text-apg-silver">Electricity </dt>
          <dd className="inline text-rose-200/90">-{paiseToInr(row.electricityDeductionPaise)}</dd>
        </div>
      ) : null}
      <div>
        <dt className="inline text-apg-silver">Refund </dt>
        <dd
          className={
            'inline ' + (row.estimatedRefundPaise === 0 ? 'text-apg-silver' : 'text-emerald-200/90')
          }
        >
          {paiseToInr(row.estimatedRefundPaise)}
        </dd>
      </div>
    </dl>
  );
}

function NextActionHero({ row, actionLabel }: { row: MoveOutPipelineItemClient; actionLabel: string }) {
  const zeroRefund = moveOutIsZeroRefundCheckout(row);

  return (
    <div
      className={
        'mb-4 rounded-xl border px-4 py-4 ' +
        (zeroRefund
          ? 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10'
          : 'border-white/15 bg-black/25')
      }
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-apg-silver">Next action</p>
      <p className="mt-1 text-lg font-bold uppercase tracking-tight text-white">
        {moveOutHeroTitle(row)}
      </p>
      <p className="mt-1 text-sm text-apg-silver">{moveOutHeroSubtitle(row)}</p>
      <div className="mt-4">
        <MoveOutPrimaryButton row={row} label={actionLabel} prominent />
      </div>
    </div>
  );
}

function MoveOutPrimaryButton({
  row,
  label,
  prominent,
}: {
  row: MoveOutPipelineItemClient;
  label: string;
  prominent?: boolean;
}) {
  const className = prominent ? PRIMARY + ' px-5 py-2.5 text-sm' : PRIMARY;

  if (row.continueKind === 'approve') {
    return (
      <ApproveVacatingButton
        requestId={row.vacatingRequestId}
        className={className}
        label={label}
        preview={pipelineApprovalPreview(row)}
      />
    );
  }

  if (row.continueHref) {
    return (
      <Link href={row.continueHref} className={className}>
        {label}
      </Link>
    );
  }

  return null;
}

function DirectLinks({ row }: { row: MoveOutPipelineItemClient }) {
  return (
    <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-white/10 pb-3">
      {row.settlementId ? (
        <Link href={`/admin/checkout-settlements/${row.settlementId}`} className={LINK}>
          View settlement
        </Link>
      ) : null}
      <Link href={`/admin/residents/${row.customerId}`} className={LINK}>
        Resident
      </Link>
      {row.settlementStatus === 'refund_pending' ? (
        <Link href={`/admin/refunds?booking=${row.bookingId}`} className={LINK}>
          Refund of Deposit
        </Link>
      ) : (
        <Link href={`/admin/deposits/${row.bookingId}`} className={LINK}>
          Deposit ledger
        </Link>
      )}
    </nav>
  );
}

function DangerActions({ row }: { row: MoveOutPipelineItemClient }) {
  const showPending = row.vacatingStatus === 'pending';
  const showApproved = row.vacatingStatus === 'approved';

  if (!showPending && !showApproved) return null;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-xs font-medium text-rose-300/80 hover:text-rose-200 marker:content-none [&::-webkit-details-marker]:hidden">
        Danger actions ▾
      </summary>
      <div className="mt-2 flex flex-wrap gap-2 rounded-lg border border-rose-400/20 bg-rose-500/5 p-3">
        {showPending ? (
          <>
            <RejectVacatingButton requestId={row.vacatingRequestId} />
            <CancelVacatingNoticeButton requestId={row.vacatingRequestId} />
          </>
        ) : null}
        {showApproved ? (
          <>
            <UndoVacatingApprovalButton requestId={row.vacatingRequestId} />
            <CancelVacatingNoticeButton requestId={row.vacatingRequestId} />
          </>
        ) : null}
      </div>
    </details>
  );
}

function StageProgress({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="mb-3 flex gap-0.5">
      {MOVE_OUT_STAGES.map((_, i) => (
        <span
          key={i}
          className={'h-1.5 flex-1 rounded-full ' + (i <= stageIndex ? 'bg-[#FF5A1F]' : 'bg-white/10')}
        />
      ))}
    </div>
  );
}

function StageTimeline({ row }: { row: MoveOutPipelineItemClient }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {MOVE_OUT_STAGES.map((stage, index) => {
        const ts = row.stageTimestamps[stage.id];
        const reached = index <= row.stageIndex;
        return (
          <div key={stage.id} className="min-w-0">
            <p
              className={
                'text-[10px] font-medium uppercase tracking-wide ' +
                (reached ? 'text-apg-silver' : 'text-apg-silver/40')
              }
            >
              {stage.label}
            </p>
            <p className={'mt-0.5 text-xs ' + (reached ? 'text-white' : 'text-apg-silver/40')}>
              {ts ? formatDateTime(ts) : reached ? 'Pending timestamp' : '—'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function noticeCompletedDaysForRow(row: MoveOutPipelineItemClient): number {
  const noticeGivenDate = normalizeIsoDateOnly(row.noticeGivenDate);
  const moveOutDate = normalizeIsoDateOnly(row.vacatingDate);
  return Math.max(0, tryDiffDays(noticeGivenDate, moveOutDate) ?? 0);
}

function pipelineApprovalPreview(row: MoveOutPipelineItemClient): VacatingApprovalPreview {
  const noticeGivenDate = normalizeIsoDateOnly(row.noticeGivenDate);
  const moveOutDate = normalizeIsoDateOnly(row.vacatingDate);
  const noticeCompletedDays = noticeCompletedDaysForRow(row);
  const noticeBreakdown = breakdownFromStoredNoticeSnapshot({
    noticeGivenDate,
    vacatingDate: moveOutDate,
    noticeGivenDays: noticeCompletedDays,
    noticeShortfallDays: Math.max(0, VACATING_NOTICE_MIN_DAYS - noticeCompletedDays),
    noticeRentCoveredDays: row.noticeRentCoveredDays,
    noticeChargeableDays: row.noticeChargeableDays,
    deductionPaise: row.deductionPaise,
  });
  return {
    residentName: row.customerFullName,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    noticeSubmittedDate: noticeGivenDate,
    moveOutDate,
    noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
    noticeCompletedDays,
    depositHeldPaise: row.depositHeldPaise,
    estimatedDeductionPaise: row.deductionPaise,
    estimatedRefundPaise: row.estimatedRefundPaise,
    bedStatus: row.bedStatus,
    noticeBreakdown,
  };
}
