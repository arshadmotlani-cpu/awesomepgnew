'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DepositDetailDrawer } from '@/src/components/admin/deposits/DepositDetailDrawer';
import { DepositRowActions } from '@/src/components/admin/deposits/DepositRowActions';
import type { DepositTableRow } from '@/src/components/admin/deposits/types';
import {
  hasOutstandingDepositDue,
  labelDepositCollectionStatus,
} from '@/src/lib/depositCollectionLabels';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  rows: DepositTableRow[];
  dueOnly: boolean;
};

export function DepositManagementPanel({ rows, dueOnly }: Props) {
  const [selected, setSelected] = useState<DepositTableRow | null>(null);

  const totals = useMemo(
    () => ({
      required: rows.reduce((a, r) => a + Number(r.depositPaise), 0),
      collected: rows.reduce((a, r) => a + Number(r.collectedPaise), 0),
      due: rows.reduce((a, r) => a + Number(r.depositDuePaise), 0),
      refundable: rows.reduce((a, r) => a + Number(r.refundableBalancePaise), 0),
    }),
    [rows],
  );

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 -mx-3 border-b border-white/10 bg-[#0B0F14]/95 px-3 py-2 backdrop-blur-sm sm:-mx-4 sm:px-4 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-base font-semibold tracking-tight text-white sm:text-lg">Deposits</h1>
          <Link
            href="/admin/deposits/add"
            className="shrink-0 rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 sm:px-4 sm:py-2 sm:text-sm"
          >
            Add deposit
          </Link>
        </div>

        <dl className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
          <InlineStat label="Required" value={paiseToInr(totals.required)} />
          <InlineStat label="Collected" value={paiseToInr(totals.collected)} accent="emerald" />
          <InlineStat
            label="Due"
            value={paiseToInr(totals.due)}
            accent={totals.due > 0 ? 'amber' : undefined}
          />
          <InlineStat label="Refundable" value={paiseToInr(totals.refundable)} />
        </dl>

        {dueOnly ? (
          <p className="mt-1.5 text-[11px] text-amber-200/90">
            Outstanding only ·{' '}
            <Link href="/admin/deposits" className="font-medium text-white underline">
              Clear filter
            </Link>
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-apg-silver">
            <Link href="/admin/deposits?filter=due" className="font-medium text-[#FF5A1F] hover:underline">
              View outstanding →
            </Link>
          </p>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
          No bookings match this filter.
        </p>
      ) : (
        <>
          <div className="mt-3 hidden rounded-xl border border-white/10 bg-[#1A1F27] md:block">
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#1A1F27]">
                <tr>
                  <Th>Resident</Th>
                  <Th>Bed</Th>
                  <Th className="text-right">Required</Th>
                  <Th className="text-right">Collected</Th>
                  <Th className="text-right">Due</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Deducted</Th>
                  <Th className="text-right">Refunded</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="min-w-[7rem] text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr
                    key={r.bookingId}
                    className="cursor-pointer transition hover:bg-white/[0.03]"
                    onClick={() => setSelected(r)}
                  >
                    <td className="px-3 py-2">
                      <p className="text-sm font-medium leading-tight text-white">
                        {r.customerFullName}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-tight text-apg-silver">
                        {r.customerPhone}
                        <span className="mx-1 text-white/20">·</span>
                        <span className="font-mono text-[#FF5A1F]/80">{r.bookingCode}</span>
                      </p>
                    </td>
                    <td className="px-3 py-2 text-[11px] leading-tight text-apg-silver">
                      {r.pgName}
                      <span className="mx-1 text-white/20">·</span>
                      R{r.roomNumber}
                      <span className="mx-1 text-white/20">·</span>
                      {r.bedCode}
                    </td>
                    <AmountCell>{paiseToInr(Number(r.depositPaise))}</AmountCell>
                    <AmountCell className="text-emerald-300">
                      {paiseToInr(Number(r.collectedPaise))}
                    </AmountCell>
                    <AmountCell className="text-amber-200">
                      {Number(r.depositDuePaise) > 0
                        ? paiseToInr(Number(r.depositDuePaise))
                        : '—'}
                    </AmountCell>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          hasOutstandingDepositDue(r)
                            ? 'rose'
                            : toneForStatus(r.depositCollectionStatus)
                        }
                      >
                        {labelDepositCollectionStatus(r.depositCollectionStatus)}
                      </Badge>
                    </td>
                    <AmountCell className="text-rose-300">
                      {paiseToInr(Number(r.deductedPaise))}
                    </AmountCell>
                    <AmountCell>{paiseToInr(Number(r.refundedPaise))}</AmountCell>
                    <AmountCell className="font-medium">
                      {paiseToInr(Number(r.refundableBalancePaise))}
                    </AmountCell>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="hidden xl:block">
                        <DepositRowActions row={r} onOpen={() => setSelected(r)} />
                      </div>
                      <div className="xl:hidden">
                        <DepositRowActions row={r} onOpen={() => setSelected(r)} compact />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:hidden">
            {rows.map((r) => (
              <article
                key={r.bookingId}
                className="rounded-lg border border-white/10 bg-[#1A1F27] p-3"
                onClick={() => setSelected(r)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-tight text-white">
                      {r.customerFullName}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-tight text-apg-silver">
                      {r.customerPhone}
                      <span className="mx-1 text-white/20">·</span>
                      <span className="font-mono text-[#FF5A1F]/80">{r.bookingCode}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-apg-silver">
                      {r.pgName} · R{r.roomNumber} · {r.bedCode}
                    </p>
                  </div>
                  <Badge
                    tone={
                      hasOutstandingDepositDue(r)
                        ? 'rose'
                        : toneForStatus(r.depositCollectionStatus)
                    }
                  >
                    {labelDepositCollectionStatus(r.depositCollectionStatus)}
                  </Badge>
                </div>
                <dl className="mt-2 grid grid-cols-4 gap-1 text-[11px]">
                  <Metric label="Req" value={paiseToInr(Number(r.depositPaise))} />
                  <Metric label="Coll" value={paiseToInr(Number(r.collectedPaise))} />
                  <Metric
                    label="Due"
                    value={
                      Number(r.depositDuePaise) > 0
                        ? paiseToInr(Number(r.depositDuePaise))
                        : '—'
                    }
                  />
                  <Metric label="Bal" value={paiseToInr(Number(r.refundableBalancePaise))} />
                </dl>
                <div className="mt-2 border-t border-white/5 pt-2" onClick={(e) => e.stopPropagation()}>
                  <DepositRowActions row={r} onOpen={() => setSelected(r)} compact />
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {selected ? (
        <DepositDetailDrawer row={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function InlineStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'amber';
}) {
  const valueClass =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'amber'
        ? 'text-amber-200'
        : 'text-white';

  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-apg-silver">{label}</dt>
      <dd className={`font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={
        'px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-apg-silver ' +
        className
      }
    >
      {children}
    </th>
  );
}

function AmountCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={'px-3 py-2 text-right text-sm tabular-nums text-white ' + className}>
      {children}
    </td>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-apg-silver">{label}</dt>
      <dd className="font-medium tabular-nums text-white">{value}</dd>
    </div>
  );
}
