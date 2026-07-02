import Link from 'next/link';
import { AdminAdvancedToolsSection } from '@/src/components/admin/AdminAdvancedToolsSection';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { VacatingRowActions } from '@/src/components/admin/vacating/VacatingRowActions';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { MoveOutAdvancedToolsRow } from '@/src/lib/moveOut/moveOutAdvancedToolsProps';

export function MoveOutAdvancedTools({
  rows,
  settlementHrefByRequest,
  depositHeldByBooking = {},
  defaultOpen = false,
}: {
  rows: MoveOutAdvancedToolsRow[];
  settlementHrefByRequest: Record<string, string>;
  depositHeldByBooking?: Record<string, number>;
  defaultOpen?: boolean;
}) {
  return (
    <AdminAdvancedToolsSection
      title="Advanced tools"
      description="Full move-out request table, status filters, and links to checkout settlements."
      defaultOpen={defaultOpen}
    >
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/refunds"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          Refund Console →
        </Link>
        <Link
          href="/admin/checkout-settlements"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          Checkout settlements →
        </Link>
        <Link
          href="/admin/deposits"
          className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
        >
          Deposit wallets →
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2">
        {[
          { label: 'All', value: '' },
          { label: 'Waiting', value: 'pending' },
          { label: 'Ready for checkout', value: 'approved' },
          { label: 'Done', value: 'completed' },
          { label: 'Declined', value: 'rejected' },
        ].map((f) => (
          <Link
            key={f.value || 'all'}
            href={f.value ? `/admin/vacating?legacy=1&status=${f.value}` : '/admin/vacating?legacy=1'}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white"
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="text-sm text-apg-silver">No move-out requests on file.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <Table>
            <THead>
              <TR>
                <TH>Submitted</TH>
                <TH>Booking</TH>
                <TH>Resident</TH>
                <TH>Bed</TH>
                <TH>Move-out date</TH>
                <TH className="text-right">Fee</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((v) => (
                <TR key={v.id}>
                  <TD className="text-xs text-apg-silver">{formatDate(v.createdAt)}</TD>
                  <TD>
                    <Link
                      href={`/admin/bookings/${v.bookingId}`}
                      className="font-mono text-xs text-[#FF5A1F] hover:underline"
                    >
                      {v.bookingCode}
                    </Link>
                  </TD>
                  <TD>
                    <div className="text-sm font-medium text-white">{v.customerFullName}</div>
                    <div className="font-mono text-[11px] text-apg-silver">{v.customerPhone}</div>
                  </TD>
                  <TD className="text-xs text-apg-silver">
                    {v.pgName} · {v.roomNumber}/{v.bedCode}
                  </TD>
                  <TD className="text-xs text-apg-silver">{formatDate(v.vacatingDate)}</TD>
                  <TD className="text-right tabular-nums text-white">
                    {paiseToInr(v.deductionPaise)}
                  </TD>
                  <TD>
                    <Badge tone={toneForStatus(v.status)}>{titleCase(v.status)}</Badge>
                  </TD>
                  <TD className="text-right">
                    <VacatingRowActions
                      requestId={v.id}
                      status={v.status}
                      settlementHref={settlementHrefByRequest[v.id]}
                      depositHeldPaise={depositHeldByBooking[v.bookingId] ?? 0}
                      approvalPreview={v.approvalPreview}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </AdminAdvancedToolsSection>
  );
}
