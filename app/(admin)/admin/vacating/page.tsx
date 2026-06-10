import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconDoor } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import {
  ApproveVacatingButton,
  CompleteVacatingButton,
  RejectVacatingButton,
} from '@/src/components/admin/VacatingActions';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS: Array<{
  label: string;
  value: '' | 'pending' | 'approved' | 'completed' | 'rejected';
}> = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Completed', value: 'completed' },
  { label: 'Rejected', value: 'rejected' },
];

export default async function AdminVacatingPage(
  props: PageProps<'/admin/vacating'>,
) {
  const sp = await props.searchParams;
  const rawStatus = typeof sp.status === 'string' ? sp.status : '';
  const status = STATUS_FILTERS.some((f) => f.value === rawStatus)
    ? (rawStatus as '' | 'pending' | 'approved' | 'completed' | 'rejected')
    : '';
  const res = await listAdminVacatingRequests(
    status ? { status: status as 'pending' | 'approved' | 'completed' | 'rejected' } : undefined,
  );

  return (
    <>
      <PageHeader
        title="Vacating requests"
        description="Monthly residents filing notice. The 5-day deduction (when notice < 15 days) is computed and snapshotted at submit time; completion writes the deposit ledger and cancels future invoices."
      />
      <nav className="mb-4 flex flex-wrap gap-2 text-xs">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value || 'all'}
            href={f.value ? `/admin/vacating?status=${f.value}` : '/admin/vacating'}
            className={
              'rounded-full px-3 py-1 ring-1 ring-inset transition-colors ' +
              (f.value === status
                ? 'bg-indigo-600 text-white ring-indigo-600'
                : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50')
            }
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : res.data.length === 0 ? (
        <EmptyState
          icon={<IconDoor />}
          title="No vacating requests"
          description="Residents submit vacating requests from their resident dashboard."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Created</TH>
              <TH>Booking</TH>
              <TH>Resident</TH>
              <TH>Bed</TH>
              <TH>Notice</TH>
              <TH>Vacating</TH>
              <TH>Compliant?</TH>
              <TH className="text-right">Deduction</TH>
              <TH className="text-right">Refund</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {res.data.map((v) => (
              <TR key={v.id}>
                <TD className="text-xs text-zinc-500">{formatDate(v.createdAt)}</TD>
                <TD>
                  <Link
                    href={`/admin/bookings/${v.bookingId}`}
                    className="font-mono text-xs text-indigo-600 hover:underline"
                  >
                    {v.bookingCode}
                  </Link>
                </TD>
                <TD>
                  <div className="text-sm text-zinc-900">{v.customerFullName}</div>
                  <div className="font-mono text-[11px] text-zinc-500">
                    {v.customerPhone}
                  </div>
                </TD>
                <TD className="text-xs">
                  {v.pgName} · {v.roomNumber}/{v.bedCode}
                </TD>
                <TD className="text-xs">{formatDate(v.noticeGivenDate)}</TD>
                <TD className="text-xs">{formatDate(v.vacatingDate)}</TD>
                <TD>
                  {v.noticeCompliant ? (
                    <span className="text-emerald-700">Yes</span>
                  ) : (
                    <span className="text-rose-700">No</span>
                  )}
                </TD>
                <TD className="text-right tabular-nums">
                  {paiseToInr(v.deductionPaise)}
                </TD>
                <TD className="text-right tabular-nums">
                  {v.status === 'completed' ? paiseToInr(v.depositRefundPaise) : '—'}
                </TD>
                <TD>
                  <Badge tone={toneForStatus(v.status)}>{titleCase(v.status)}</Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    {v.status === 'pending' ? (
                      <>
                        <ApproveVacatingButton requestId={v.id} />
                        <RejectVacatingButton requestId={v.id} />
                      </>
                    ) : null}
                    {(v.status === 'pending' || v.status === 'approved') ? (
                      <CompleteVacatingButton requestId={v.id} />
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
