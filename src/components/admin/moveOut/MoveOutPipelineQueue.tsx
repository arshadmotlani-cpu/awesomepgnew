'use client';

import Link from 'next/link';
import { ApproveVacatingButton } from '@/src/components/admin/VacatingActions';
import {
  CancelVacatingNoticeButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
} from '@/src/components/admin/VacatingActions';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate, formatDateTime, paiseToInr } from '@/src/lib/format';
import { diffDays } from '@/src/lib/dates';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import {
  MOVE_OUT_STAGES,
  type MoveOutPipelineItem,
} from '@/src/lib/moveOut/moveOutPipeline';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110';

const URGENCY_ROW_CLASS: Record<MoveOutPipelineItem['urgency'], string> = {
  high: 'bg-rose-500/[0.07] ring-1 ring-inset ring-rose-400/25',
  medium: 'bg-amber-500/[0.06] ring-1 ring-inset ring-amber-400/20',
  normal: '',
};

const URGENCY_BADGE_CLASS: Record<MoveOutPipelineItem['urgency'], string> = {
  high: 'bg-rose-500/20 text-rose-100 ring-rose-400/40',
  medium: 'bg-amber-500/15 text-amber-100 ring-amber-400/30',
  normal: 'bg-white/5 text-apg-silver ring-white/10',
};

export function MoveOutPipelineQueue({
  items,
  compact,
}: {
  items: MoveOutPipelineItem[];
  compact?: boolean;
}) {
  if (items.length === 0) {
    if (compact) return null;
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

  return (
    <section className="mb-8">
      {!compact ? (
        <header className="mb-4">
          <h2 className="text-lg font-bold text-white">Move-out pipeline</h2>
          <p className="mt-1 text-sm text-apg-silver">
            Sorted by earliest move-out date — review deposit and notice before approving.
          </p>
        </header>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>Room / bed</TH>
              <TH>Move-out date</TH>
              <TH>Days remaining</TH>
              <TH className="text-right">Deposit held</TH>
              <TH className="text-right">Expected refund</TH>
              <TH>Current stage</TH>
              <TH>Next action</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((row) => (
              <PipelineRow key={row.id} row={row} compact={compact} />
            ))}
          </TBody>
        </Table>
      </div>
    </section>
  );
}

function PipelineRow({ row, compact }: { row: MoveOutPipelineItem; compact?: boolean }) {
  const isComplete = row.stage === 'bed_released';
  const urgencyClass = isComplete ? '' : URGENCY_ROW_CLASS[row.urgency];
  const daysLabel =
    row.daysRemaining < 0
      ? 'Overdue'
      : row.daysRemaining === 0
        ? 'Today'
        : `${row.daysRemaining} day${row.daysRemaining === 1 ? '' : 's'}`;

  return (
    <>
      <TR className={urgencyClass}>
        <TD>
          <Link
            href={`/admin/residents/${row.customerId}`}
            className="font-medium text-white hover:text-[#FF5A1F]"
          >
            {row.customerFullName}
          </Link>
          <p className="font-mono text-[11px] text-apg-silver">{row.customerPhone}</p>
          {!compact ? (
            <p className="text-[10px] text-apg-silver/80">{row.bookingCode}</p>
          ) : null}
        </TD>
        <TD className="text-xs text-apg-silver">
          {row.roomNumber} · {row.bedCode}
          <p className="text-[10px] text-apg-silver/80">{row.pgName}</p>
          <p className="mt-1 text-[10px] text-apg-silver/70">Bed: {row.bedStatus}</p>
        </TD>
        <TD className="text-xs text-white">{formatDate(row.vacatingDate)}</TD>
        <TD>
          {isComplete ? (
            <span className="text-xs text-apg-silver">—</span>
          ) : (
            <span
              className={
                'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ' +
                URGENCY_BADGE_CLASS[row.urgency]
              }
            >
              {daysLabel}
            </span>
          )}
        </TD>
        <TD className="text-right tabular-nums text-xs text-white">
          {paiseToInr(row.depositHeldPaise)}
        </TD>
        <TD className="text-right tabular-nums text-xs text-emerald-200/90">
          {paiseToInr(row.estimatedRefundPaise)}
        </TD>
        <TD>
          <StageBadge stageIndex={row.stageIndex} label={row.stageLabel} />
          <PipelineProgress stageIndex={row.stageIndex} />
        </TD>
        <TD className="max-w-[200px] text-xs text-apg-silver">{row.nextAction}</TD>
        <TD className="text-right">
          <MoveOutPipelineRowActions row={row} />
        </TD>
      </TR>
      {!compact ? (
        <TR className={urgencyClass}>
          <TD colSpan={9} className="border-t border-white/5 bg-black/20 px-4 py-3">
            <StageTimeline row={row} />
          </TD>
        </TR>
      ) : null}
    </>
  );
}

function StageTimeline({ row }: { row: MoveOutPipelineItem }) {
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

function StageBadge({ stageIndex, label }: { stageIndex: number; label: string }) {
  const tone =
    stageIndex <= 1
      ? 'bg-sky-500/20 text-sky-100 ring-sky-400/30'
      : stageIndex <= 3
        ? 'bg-amber-500/15 text-amber-100 ring-amber-400/30'
        : stageIndex <= 5
          ? 'bg-[#FF5A1F]/20 text-orange-100 ring-[#FF5A1F]/40'
          : 'bg-emerald-500/15 text-emerald-100 ring-emerald-400/30';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone}`}>
      {label}
    </span>
  );
}

function PipelineProgress({ stageIndex }: { stageIndex: number }) {
  return (
    <div className="mt-2 flex gap-0.5">
      {MOVE_OUT_STAGES.map((_, i) => (
        <span
          key={i}
          className={
            'h-1 flex-1 rounded-full ' + (i <= stageIndex ? 'bg-[#FF5A1F]' : 'bg-white/10')
          }
        />
      ))}
    </div>
  );
}

function pipelineApprovalPreview(row: MoveOutPipelineItem): VacatingApprovalPreview {
  const noticeCompletedDays = Math.max(0, diffDays(row.noticeGivenDate, row.vacatingDate));
  return {
    residentName: row.customerFullName,
    pgName: row.pgName,
    roomNumber: row.roomNumber,
    bedCode: row.bedCode,
    noticeSubmittedDate: row.noticeGivenDate,
    moveOutDate: row.vacatingDate,
    noticeRequiredDays: VACATING_NOTICE_MIN_DAYS,
    noticeCompletedDays,
    depositHeldPaise: row.depositHeldPaise,
    estimatedDeductionPaise: row.deductionPaise,
    estimatedRefundPaise: row.estimatedRefundPaise,
    bedStatus: row.bedStatus,
  };
}

function MoveOutPipelineRowActions({ row }: { row: MoveOutPipelineItem }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.continueKind === 'approve' ? (
        <ApproveVacatingButton
          requestId={row.vacatingRequestId}
          className={PRIMARY}
          label="Continue"
          preview={pipelineApprovalPreview(row)}
        />
      ) : row.continueHref ? (
        <Link href={row.continueHref} className={PRIMARY}>
          Continue
        </Link>
      ) : null}

      <details className="relative inline-block text-left">
        <summary className="cursor-pointer list-none rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-apg-silver hover:bg-white/5 hover:text-white marker:content-none [&::-webkit-details-marker]:hidden">
          More ▾
        </summary>
        <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-lg border border-white/10 bg-[#1A1F27] py-1 shadow-xl">
          {row.settlementId ? (
            <Link
              href={`/admin/checkout-settlements/${row.settlementId}`}
              className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
            >
              Open checkout settlement
            </Link>
          ) : null}
          <Link
            href={`/admin/residents/${row.customerId}`}
            className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
          >
            Resident profile
          </Link>
          <Link
            href={`/admin/bookings/${row.bookingId}`}
            className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
          >
            Booking details
          </Link>
          <Link
            href={`/admin/deposits/${row.bookingId}`}
            className="block px-3 py-2 text-xs text-apg-silver hover:bg-white/5 hover:text-white"
          >
            Security deposit
          </Link>
          {row.vacatingStatus === 'pending' ? (
            <div className="border-t border-white/10 px-2 py-2">
              <RejectVacatingButton requestId={row.vacatingRequestId} />
              <CancelVacatingNoticeButton requestId={row.vacatingRequestId} />
            </div>
          ) : null}
          {row.vacatingStatus === 'approved' ? (
            <div className="border-t border-white/10 px-2 py-2">
              <UndoVacatingApprovalButton requestId={row.vacatingRequestId} />
              <CancelVacatingNoticeButton requestId={row.vacatingRequestId} />
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
