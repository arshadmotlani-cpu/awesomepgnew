'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ApproveVacatingButton,
  CancelVacatingNoticeButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
} from '@/src/components/admin/VacatingActions';
import { NoticeSettlementPanel } from '@/src/components/shared/NoticeDeductionBreakdown';
import { formatDate, formatDateTime, paiseToInr } from '@/src/lib/format';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import type { MoveOutUrgency } from '@/src/lib/vacating/approvalPreview';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import { bookingFinancialWorkspaceSectionHref } from '@/src/lib/bookings/bookingFinancialLinks';
import {
  MOVE_OUT_WORKFLOW_STAGES,
  deriveMoveOutWorkflowStage,
  moveOutWorkflowStageIndex,
  moveOutWorkflowWaitingOnLabel,
  type MoveOutWorkflowStageId,
} from '@/src/lib/moveOut/moveOutWorkflowStages';
import {
  moveOutHeroSubtitle,
  moveOutHeroTitle,
  moveOutIsZeroRefundCheckout,
  moveOutItemsForWorkflowStage,
  moveOutMatchesFilter,
  moveOutOverdueDays,
  moveOutPrimaryActionLabel,
  moveOutRequiresActionChip,
  vacatingPipelineHref,
  type MoveOutWorkflowFilter,
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

const ACTIVE_STAGE_ORDER: MoveOutWorkflowStageId[] = [
  'pending_request',
  'waiting_vacating_date',
  'settlement_review',
  'refund_ready',
];

export function MoveOutPipelineQueue({
  items,
  filter = 'all',
  completedSection,
  approvalPreviewByRequestId,
  opsActionOnly,
}: {
  items: MoveOutPipelineItemClient[];
  filter?: MoveOutWorkflowFilter;
  completedSection?: boolean;
  approvalPreviewByRequestId?: Record<string, VacatingApprovalPreview>;
  /** Operations Move-out tab: actionable rows only, grouped by workflow stage. */
  opsActionOnly?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sourceItems = useMemo(() => {
    if (!opsActionOnly) return items;
    return items.filter((item) => deriveMoveOutWorkflowStage(item).requiresAdminAction);
  }, [items, opsActionOnly]);

  const filtered = useMemo(
    () => sourceItems.filter((item) => moveOutMatchesFilter(item, filter)),
    [sourceItems, filter],
  );

  const stageSections = useMemo(() => {
    if (completedSection || filter === 'completed') {
      return [{ stageId: 'completed' as const, rows: filtered }];
    }
    if (filter !== 'all') {
      const stageId = filter as MoveOutWorkflowStageId;
      return [{ stageId, rows: filtered }];
    }
    return ACTIVE_STAGE_ORDER.map((stageId) => ({
      stageId,
      rows: moveOutItemsForWorkflowStage(filtered, stageId),
    })).filter((section) => section.rows.length > 0);
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
      {stageSections.map(({ stageId, rows }) => {
        const stageDef = MOVE_OUT_WORKFLOW_STAGES.find((s) => s.id === stageId);
        const title = stageDef?.label ?? 'Move-outs';
        return (
          <div key={stageId}>
            <SectionHeader
              title={title}
              count={rows.length}
              tone={
                stageId === 'pending_request'
                  ? 'pending'
                  : stageId === 'settlement_review' || stageId === 'refund_ready'
                    ? 'action'
                    : undefined
              }
              pipelineHref={opsActionOnly ? vacatingPipelineHref(stageId) : undefined}
            />
            <div className="space-y-2">
              {rows.map((row) => (
                <MoveOutCard
                  key={row.id}
                  row={row}
                  expanded={expandedId === row.id}
                  onToggle={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                  approvalPreviewByRequestId={approvalPreviewByRequestId}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function SectionHeader({
  title,
  count,
  tone,
  pipelineHref,
}: {
  title: string;
  count: number;
  tone?: 'pending' | 'action';
  pipelineHref?: string;
}) {
  return (
    <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex items-baseline gap-2">
        <h3
          className={
            'text-sm font-bold uppercase tracking-wide ' +
            (tone === 'pending'
              ? 'text-amber-200'
              : tone === 'action'
                ? 'text-[#FF5A1F]'
                : 'text-white')
          }
        >
          {title}
        </h3>
        <span className="text-sm font-semibold text-apg-silver">({count})</span>
      </div>
      {pipelineHref ? (
        <Link href={pipelineHref} className={LINK}>
          View full pipeline
        </Link>
      ) : null}
    </header>
  );
}

function MoveOutCard({
  row,
  expanded,
  onToggle,
  approvalPreviewByRequestId,
}: {
  row: MoveOutPipelineItemClient;
  expanded: boolean;
  onToggle: () => void;
  approvalPreviewByRequestId?: Record<string, VacatingApprovalPreview>;
}) {
  const workflow = deriveMoveOutWorkflowStage(row);
  const actionLabel = moveOutPrimaryActionLabel(row);
  const isComplete = workflow.id === 'completed';
  const overdueDays = moveOutOverdueDays(row);
  const showPrimary = workflow.requiresAdminAction;
  const trackingOnly = workflow.id === 'waiting_vacating_date';

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
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">
                {row.customerFullName}
                <span className="mx-1.5 text-apg-silver/60">•</span>
                <span className="font-normal text-apg-silver">
                  {row.roomNumber}-{row.bedCode}
                </span>
              </p>
              {moveOutRequiresActionChip(row) ? (
                <span className="rounded-md bg-[#FF5A1F]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#FF5A1F]">
                  Action required
                </span>
              ) : null}
            </div>
            {trackingOnly ? (
              <p className="mt-1 text-xs text-apg-silver">
                Approved leaving {formatDate(row.vacatingDate)}
                {' · '}
                {row.daysRemaining >= 0
                  ? `${row.daysRemaining} day${row.daysRemaining === 1 ? '' : 's'} remaining`
                  : `${overdueDays} day${overdueDays === 1 ? '' : 's'} past vacate date`}
                {' · '}
                {moveOutWorkflowWaitingOnLabel(workflow.waitingOn)}
              </p>
            ) : null}
            {!isComplete ? (
              <p className="mt-1.5 text-xs text-apg-silver">
                <span className="font-semibold uppercase tracking-wide text-apg-silver/80">
                  Next:
                </span>{' '}
                {moveOutHeroSubtitle(row)}
              </p>
            ) : null}
            {!trackingOnly && !isComplete ? (
              <p className="mt-1 text-xs text-apg-silver/80">
                Refund {paiseToInr(row.estimatedRefundPaise)}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {!expanded && showPrimary ? (
              <MoveOutPrimaryButton
                row={row}
                label={actionLabel}
                approvalPreviewByRequestId={approvalPreviewByRequestId}
              />
            ) : null}
            <span className="text-apg-silver/60">{expanded ? '▴' : '▾'}</span>
          </div>
        </div>
        {!trackingOnly ? <FinancialSummary row={row} className="mt-3" /> : null}
      </button>

      {expanded ? (
        <div className="border-t border-white/10 px-4 pb-4 pt-3">
          {!isComplete && showPrimary ? (
            <NextActionHero
              row={row}
              actionLabel={actionLabel}
              approvalPreviewByRequestId={approvalPreviewByRequestId}
            />
          ) : !isComplete && trackingOnly ? (
            <div className="mb-4 rounded-xl border border-white/15 bg-black/25 px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-apg-silver">
                Tracking only
              </p>
              <p className="mt-1 text-lg font-bold text-white">{workflow.label}</p>
              <p className="mt-1 text-sm text-apg-silver">{workflow.nextAction}</p>
            </div>
          ) : isComplete ? (
            <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/80">
                Move-out complete
              </p>
              <p className="mt-1 text-sm text-emerald-100">Bed released and checkout closed.</p>
            </div>
          ) : null}

          <div className="mb-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-apg-silver">
              Progress
            </p>
            <p className="mb-2 text-xs text-apg-silver">
              {moveOutWorkflowWaitingOnLabel(workflow.waitingOn)}
              {row.updatedAt ? ` · Updated ${formatDateTime(row.updatedAt)}` : ''}
            </p>
            <StageProgress row={row} />
            <StageTimeline row={row} />
          </div>

          {row.deductionPaise > 0 ? (
            <div className="mb-4">
              {(() => {
                const preview = approvalPreviewByRequestId?.[row.vacatingRequestId];
                const settlement = preview?.noticeBreakdown;
                return settlement ? (
                  <NoticeSettlementPanel settlement={settlement} variant="admin" compact />
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
    <dl className={'flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums ' + className}>
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

function NextActionHero({
  row,
  actionLabel,
  approvalPreviewByRequestId,
}: {
  row: MoveOutPipelineItemClient;
  actionLabel: string;
  approvalPreviewByRequestId?: Record<string, VacatingApprovalPreview>;
}) {
  const zeroRefund = moveOutIsZeroRefundCheckout(row);

  return (
    <div
      className={
        'mb-4 rounded-xl border px-4 py-4 ' +
        (zeroRefund ? 'border-[#FF5A1F]/40 bg-[#FF5A1F]/10' : 'border-white/15 bg-black/25')
      }
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-apg-silver">Next action</p>
      <p className="mt-1 text-lg font-bold uppercase tracking-tight text-white">
        {moveOutHeroTitle(row)}
      </p>
      <p className="mt-1 text-sm text-apg-silver">{moveOutHeroSubtitle(row)}</p>
      <div className="mt-4">
        <MoveOutPrimaryButton
          row={row}
          label={actionLabel}
          prominent
          approvalPreviewByRequestId={approvalPreviewByRequestId}
        />
      </div>
    </div>
  );
}

function MoveOutPrimaryButton({
  row,
  label,
  prominent,
  approvalPreviewByRequestId,
}: {
  row: MoveOutPipelineItemClient;
  label: string;
  prominent?: boolean;
  approvalPreviewByRequestId?: Record<string, VacatingApprovalPreview>;
}) {
  const className = prominent ? PRIMARY + ' px-5 py-2.5 text-sm' : PRIMARY;

  if (row.continueKind === 'approve') {
    const preview = approvalPreviewByRequestId?.[row.vacatingRequestId];
    if (!preview?.estimatedSettlement) {
      return (
        <span
          className={className + ' cursor-not-allowed opacity-50'}
          aria-disabled
          title={
            preview
              ? 'Settlement preview could not be loaded — refresh or open move-out pipeline'
              : 'Loading settlement preview…'
          }
        >
          {label}
        </span>
      );
    }
    return (
      <ApproveVacatingButton
        requestId={row.vacatingRequestId}
        className={className}
        label={label}
        preview={preview}
        bookingId={row.bookingId}
        bookingCode={row.bookingCode}
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
  const financialHref =
    row.settlementStatus === 'refund_pending'
      ? bookingFinancialWorkspaceSectionHref(row.bookingId, 'refund')
      : row.settlementStatus === 'awaiting_admin_review' || row.settlementId
        ? bookingFinancialWorkspaceSectionHref(row.bookingId, 'checkout')
        : bookingFinancialWorkspaceSectionHref(row.bookingId, 'move-out');

  return (
    <nav className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-white/10 pb-3">
      <Link href={financialHref} className={LINK}>
        Financial workspace
      </Link>
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

function StageProgress({ row }: { row: MoveOutPipelineItemClient }) {
  const index = moveOutWorkflowStageIndex(deriveMoveOutWorkflowStage(row).id);
  return (
    <div className="mb-3 flex gap-0.5">
      {MOVE_OUT_WORKFLOW_STAGES.map((_, i) => (
        <span
          key={i}
          className={'h-1.5 flex-1 rounded-full ' + (i <= index ? 'bg-[#FF5A1F]' : 'bg-white/10')}
        />
      ))}
    </div>
  );
}

function StageTimeline({ row }: { row: MoveOutPipelineItemClient }) {
  const currentIndex = moveOutWorkflowStageIndex(deriveMoveOutWorkflowStage(row).id);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {MOVE_OUT_WORKFLOW_STAGES.map((stage, index) => {
        const reached = index <= currentIndex;
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
              {reached && index === currentIndex ? 'Current' : reached ? 'Done' : '—'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
