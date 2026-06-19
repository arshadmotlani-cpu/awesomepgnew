'use client';

import Link from 'next/link';
import { ApproveVacatingButton } from '@/src/components/admin/VacatingActions';
import {
  CancelVacatingNoticeButton,
  RejectVacatingButton,
  UndoVacatingApprovalButton,
} from '@/src/components/admin/VacatingActions';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate } from '@/src/lib/format';
import {
  MOVE_OUT_STAGES,
  type MoveOutPipelineItem,
} from '@/src/lib/moveOut/moveOutPipeline';

const PRIMARY =
  'inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110';

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
        <>
          <header className="mb-4">
            <h2 className="text-lg font-bold text-white">Move-out pipeline</h2>
            <p className="mt-1 text-sm text-apg-silver">
              One row per resident — sorted by what needs you next.
            </p>
          </header>

          <div className="mb-6 overflow-x-auto rounded-xl border border-white/10 bg-[#12161C] p-4">
            <div className="flex min-w-[640px] items-center gap-1">
              {MOVE_OUT_STAGES.map((stage, index) => (
                <div key={stage.id} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full items-center">
                    {index > 0 ? (
                      <span className="h-px flex-1 bg-white/15" />
                    ) : (
                      <span className="flex-1" />
                    )}
                    <span className="size-2 rounded-full bg-white/25" />
                    {index < MOVE_OUT_STAGES.length - 1 ? (
                      <span className="h-px flex-1 bg-white/15" />
                    ) : (
                      <span className="flex-1" />
                    )}
                  </div>
                  <span className="max-w-[5.5rem] text-center text-[9px] leading-tight text-apg-silver">
                    {stage.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>Room / bed</TH>
              <TH>Move-out date</TH>
              <TH>Current stage</TH>
              <TH>Next required action</TH>
              <TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((row) => (
              <TR key={row.id}>
                <TD>
                  <Link
                    href={`/admin/residents/${row.customerId}`}
                    className="font-medium text-white hover:text-[#FF5A1F]"
                  >
                    {row.customerFullName}
                  </Link>
                  <p className="font-mono text-[11px] text-apg-silver">{row.customerPhone}</p>
                  <p className="text-[10px] text-apg-silver/80">{row.bookingCode}</p>
                </TD>
                <TD className="text-xs text-apg-silver">
                  R{row.roomNumber} · {row.bedCode}
                  <p className="text-[10px] text-apg-silver/80">{row.pgName}</p>
                </TD>
                <TD className="text-xs">{formatDate(row.vacatingDate)}</TD>
                <TD>
                  <StageBadge stageIndex={row.stageIndex} label={row.stageLabel} />
                  <PipelineProgress stageIndex={row.stageIndex} />
                </TD>
                <TD className="max-w-[200px] text-xs text-apg-silver">{row.nextAction}</TD>
                <TD className="text-right">
                  <MoveOutPipelineRowActions row={row} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </section>
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
            'h-1 flex-1 rounded-full ' +
            (i <= stageIndex ? 'bg-[#FF5A1F]' : 'bg-white/10')
          }
        />
      ))}
    </div>
  );
}

function MoveOutPipelineRowActions({ row }: { row: MoveOutPipelineItem }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.continueKind === 'approve' ? (
        <ApproveVacatingButton
          requestId={row.vacatingRequestId}
          className={PRIMARY}
          label="Continue"
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
