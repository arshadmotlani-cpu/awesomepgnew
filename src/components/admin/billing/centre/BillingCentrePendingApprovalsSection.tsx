'use client';

import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import type { BillingCentreApprovalRow } from '@/src/lib/admin/billingCentreDashboardPresentation';
import { paiseToInr } from '@/src/lib/format';

export function BillingCentrePendingApprovalsSection({
  rows,
}: {
  rows: BillingCentreApprovalRow[];
}) {
  return (
    <section id="approvals">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Pending approvals</h2>
          <p className="mt-0.5 text-xs text-apg-silver">
            Payment proofs, KYC, vacating, and refund queues
          </p>
        </div>
        <Link
          href="/admin/operations?filter=waiting_for_approval"
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          Operations →
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-5 text-sm text-emerald-100">
          No pending approvals.
        </p>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Resident</TH>
                <TH>PG · room</TH>
                <TH className="text-right">Amount</TH>
                <TH>Reason</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {rows.slice(0, 15).map((row) => (
                <TR key={row.id}>
                  <TD>
                    <Badge tone="amber">{row.queueLabel}</Badge>
                  </TD>
                  <TD className="min-w-0 max-w-[9rem]">
                    <span className="block truncate font-medium text-white" title={row.residentName}>
                      {row.residentName}
                    </span>
                    {row.residentPhone ? (
                      <p className="truncate font-mono text-[10px] text-apg-silver">{row.residentPhone}</p>
                    ) : null}
                  </TD>
                  <TD className="max-w-[8rem] truncate text-xs text-apg-silver">
                    {row.pgName ?? '—'}
                    {row.roomNumber ? ` · R${row.roomNumber}` : ''}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {row.amountPaise != null ? paiseToInr(row.amountPaise) : '—'}
                  </TD>
                  <TD className="max-w-[10rem] truncate text-xs text-apg-silver" title={row.reason}>
                    {row.reason}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={row.openHref}
                      className="text-[11px] font-medium text-[#FF5A1F] hover:underline"
                    >
                      {row.openLabel}
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </section>
  );
}
