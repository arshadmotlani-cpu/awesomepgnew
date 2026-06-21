'use client';

import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import type { PgDepositResidentRow } from '@/src/services/pgDepositCollection';
import { groupRowsByRoom } from '@/src/lib/billing/roomBedSort';
import { DepositPendingRowActions } from '@/src/components/admin/deposits/DepositPendingRowActions';
import { Badge } from '@/src/components/admin/Badge';
import { depositStatusLabel } from '@/src/lib/deposits/depositCollectionStatus';
import { useState } from 'react';
import { ResidentBillingTimelineDrawer } from '@/src/components/admin/billing/ResidentBillingTimelineDrawer';

function statusTone(status: PgDepositResidentRow['depositStatus']) {
  switch (status) {
    case 'paid':
      return 'emerald' as const;
    case 'pending':
      return 'amber' as const;
    case 'requirement_missing':
      return 'violet' as const;
  }
}

export function DepositCollectedResidentTable({
  rows,
  mode,
  pgId,
  pgName,
}: {
  rows: PgDepositResidentRow[];
  mode: 'paid' | 'action';
  pgId: string;
  pgName: string;
}) {
  const [selected, setSelected] = useState<PgDepositResidentRow | null>(null);
  const groups = groupRowsByRoom(rows);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03]">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Room / bed · resident
                </th>
                {mode === 'action' ? (
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Deposit status
                  </th>
                ) : null}
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Check-in
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Billing
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Next rent due
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                  Required
                </th>
                {mode === 'paid' ? (
                  <>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Paid
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
                      Payment date
                    </th>
                  </>
                ) : (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Outstanding
                  </th>
                )}
                {mode === 'action' ? (
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-apg-silver">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {groups.map((group) => (
                <GroupBlock
                  key={group.roomNumber}
                  group={group}
                  mode={mode}
                  pgId={pgId}
                  pgName={pgName}
                  onSelect={setSelected}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ResidentBillingTimelineDrawer
        open={selected != null}
        onClose={() => setSelected(null)}
        resident={selected}
      />
    </>
  );
}

function GroupBlock({
  group,
  mode,
  pgId,
  pgName,
  onSelect,
}: {
  group: { roomNumber: string; residents: PgDepositResidentRow[] };
  mode: 'paid' | 'action';
  pgId: string;
  pgName: string;
  onSelect: (row: PgDepositResidentRow) => void;
}) {
  return (
    <>
      <tr className="bg-white/[0.04]">
        <td
          colSpan={mode === 'action' ? 8 : 7}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          Room {group.roomNumber}
        </td>
      </tr>
      {group.residents.map((r) => (
        <tr
          key={r.bookingId}
          className="cursor-pointer transition hover:bg-white/[0.03]"
          onClick={() => onSelect(r)}
        >
          <td className="px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-apg-silver">{r.bedCode}</span>
              <span className="text-apg-silver/50">·</span>
              <Link
                href={`/admin/residents/${r.customerId}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-white hover:text-[#FF5A1F]"
              >
                {r.customerName}
              </Link>
            </div>
            <div className="text-[11px] text-apg-silver">{r.phone}</div>
          </td>
          {mode === 'action' ? (
            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
              <Badge tone={statusTone(r.depositStatus)}>
                {depositStatusLabel(r.depositStatus)}
              </Badge>
            </td>
          ) : null}
          <td className="px-4 py-3 text-xs text-apg-silver">{formatDate(r.moveInDate)}</td>
          <td className="px-4 py-3 text-xs text-apg-silver">Monthly · day {r.billingDay}</td>
          <td className="px-4 py-3 text-xs text-white">{formatDate(r.nextRentDueDate)}</td>
          <td className="px-4 py-3 text-right tabular-nums text-white">
            {r.requiredDepositPaise > 0 ? paiseToInr(r.requiredDepositPaise) : '—'}
          </td>
          {mode === 'paid' ? (
            <>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-300">
                {paiseToInr(r.paidAmountPaise)}
              </td>
              <td className="px-4 py-3 text-xs text-apg-silver">
                {r.paymentDate ? formatDate(r.paymentDate) : '—'}
              </td>
            </>
          ) : (
            <td className="px-4 py-3 text-right tabular-nums text-amber-200">
              {r.depositStatus === 'requirement_missing'
                ? '—'
                : paiseToInr(r.outstandingPaise)}
            </td>
          )}
          {mode === 'action' ? (
            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
              <DepositPendingRowActions
                pgId={pgId}
                pgName={pgName}
                resident={r}
                depositStatus={r.depositStatus}
              />
            </td>
          ) : null}
        </tr>
      ))}
    </>
  );
}
