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
    <div className="flex min-h-0 flex-col gap-4">
      {dueOnly ? (
        <p className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Showing bookings with outstanding deposit balances only.{' '}
          <Link href="/admin/deposits" className="font-semibold text-white underline">
            Clear filter
          </Link>
        </p>
      ) : (
        <p className="shrink-0 text-sm text-apg-silver">
          <Link
            href="/admin/deposits?filter=due"
            className="font-semibold text-[#FF5A1F] hover:underline"
          >
            View outstanding deposits →
          </Link>
        </p>
      )}

      <section className="shrink-0 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Required" value={paiseToInr(totals.required)} />
        <StatCard label="Collected (ledger)" value={paiseToInr(totals.collected)} />
        <StatCard label="Still due" value={paiseToInr(totals.due)} accent={totals.due > 0} />
        <StatCard label="Refundable balance" value={paiseToInr(totals.refundable)} />
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
          No bookings match this filter.
        </p>
      ) : (
        <>
          {/* Desktop: scrollable table with sticky header */}
          <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27] md:flex md:max-h-[calc(100dvh-18rem)]">
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#1A1F27] shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                  <tr>
                    <Th>Resident / booking</Th>
                    <Th>Bed</Th>
                    <Th className="text-right">Required</Th>
                    <Th className="text-right">Collected</Th>
                    <Th className="text-right">Due</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Deducted</Th>
                    <Th className="text-right">Refunded</Th>
                    <Th className="text-right">Balance</Th>
                    <Th className="text-right min-w-[11rem]">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rows.map((r) => (
                    <tr
                      key={r.bookingId}
                      className="cursor-pointer transition hover:bg-white/[0.03]"
                      onClick={() => setSelected(r)}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-white">{r.customerFullName}</p>
                        <p className="font-mono text-[11px] text-apg-silver">{r.customerPhone}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-[#FF5A1F]/80">{r.bookingCode}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-apg-silver">
                        {r.pgName}
                        <div>
                          Room {r.roomNumber} · {r.bedCode}
                        </div>
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
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="hidden lg:block">
                          <DepositRowActions row={r} onOpen={() => setSelected(r)} />
                        </div>
                        <div className="lg:hidden">
                          <DepositRowActions row={r} onOpen={() => setSelected(r)} compact />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: card list */}
          <div className="flex max-h-[calc(100dvh-18rem)] flex-col gap-3 overflow-y-auto overscroll-contain md:hidden">
            {rows.map((r) => (
              <article
                key={r.bookingId}
                className="rounded-xl border border-white/10 bg-[#1A1F27] p-4"
                onClick={() => setSelected(r)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{r.customerFullName}</p>
                    <p className="text-xs text-apg-silver">
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
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Metric label="Required" value={paiseToInr(Number(r.depositPaise))} />
                  <Metric label="Collected" value={paiseToInr(Number(r.collectedPaise))} />
                  <Metric
                    label="Due"
                    value={
                      Number(r.depositDuePaise) > 0
                        ? paiseToInr(Number(r.depositDuePaise))
                        : '—'
                    }
                  />
                  <Metric
                    label="Balance"
                    value={paiseToInr(Number(r.refundableBalancePaise))}
                  />
                </dl>
                <div className="mt-3 border-t border-white/5 pt-3" onClick={(e) => e.stopPropagation()}>
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

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'rounded-xl border p-4 ' +
        (accent ? 'border-amber-400/30 bg-amber-500/10' : 'border-white/10 bg-[#1A1F27]')
      }
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
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
        'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver ' + className
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
    <td className={'px-4 py-3 text-right tabular-nums text-white ' + className}>{children}</td>
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
