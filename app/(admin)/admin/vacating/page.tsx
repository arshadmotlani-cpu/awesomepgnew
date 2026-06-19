import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconDoor } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { VacatingPrimaryActions } from '@/src/components/admin/vacating/VacatingPrimaryActions';
import { VacatingRowActions } from '@/src/components/admin/vacating/VacatingRowActions';
import { VacatingSummarySection } from '@/src/components/admin/vacating/VacatingSummarySection';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { getCheckoutSettlementIdForVacating } from '@/src/services/checkoutSettlement';

const STATUS_FILTERS: Array<{
  label: string;
  value: '' | 'pending' | 'approved' | 'completed' | 'rejected';
}> = [
  { label: 'All', value: '' },
  { label: 'Waiting', value: 'pending' },
  { label: 'Ready for checkout', value: 'approved' },
  { label: 'Done', value: 'completed' },
  { label: 'Declined', value: 'rejected' },
];

export const dynamic = 'force-dynamic';

export default async function AdminVacatingPage(props: PageProps<'/admin/vacating'>) {
  const sp = await props.searchParams;
  const readParam = typeof sp.read === 'string' ? sp.read : undefined;
  await ensureAdminPageNotificationsSeen('/admin/vacating', '/admin/vacating', readParam);

  const rawStatus = typeof sp.status === 'string' ? sp.status : '';
  const status = STATUS_FILTERS.some((f) => f.value === rawStatus)
    ? (rawStatus as '' | 'pending' | 'approved' | 'completed' | 'rejected')
    : '';
  const res = await listAdminVacatingRequests(
    status ? { status: status as 'pending' | 'approved' | 'completed' | 'rejected' } : undefined,
  );

  const settlementHrefByRequest = new Map<string, string>();
  if (res.ok) {
    await Promise.all(
      res.data
        .filter((v) => v.status === 'approved')
        .map(async (v) => {
          const settlementId = await getCheckoutSettlementIdForVacating(v.id);
          if (settlementId) {
            settlementHrefByRequest.set(v.id, `/admin/checkout-settlements/${settlementId}`);
          }
        }),
    );
  }

  const pendingCount = res.ok ? res.data.filter((v) => v.status === 'pending').length : 0;
  const approvedCount = res.ok ? res.data.filter((v) => v.status === 'approved').length : 0;

  return (
    <>
      <PageHeader
        title="Move-out requests"
        description="Residents who gave notice to leave. Approve here — finish deposit refund in Checkout settlements."
      />

      {!res.ok ? (
        <DbStatusBanner error={res.error} />
      ) : (
        <>
          <VacatingSummarySection rows={res.data} />
          <VacatingPrimaryActions pendingCount={pendingCount} approvedCount={approvedCount} />

          <section className="mb-4">
            <h2 className="mb-3 text-base font-semibold text-white">All requests</h2>
            <nav className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <Link
                  key={f.value || 'all'}
                  href={f.value ? `/admin/vacating?status=${f.value}` : '/admin/vacating'}
                  className={
                    'rounded-full px-3 py-1.5 text-xs font-medium transition ' +
                    (f.value === status
                      ? 'bg-[#FF5A1F] text-white'
                      : 'border border-white/10 text-apg-silver hover:text-white')
                  }
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          </section>

          {res.data.length === 0 ? (
            <EmptyState
              icon={<IconDoor />}
              title="No move-out requests"
              description="Residents submit move-out notice from their account."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table>
                <THead>
                  <TR>
                    <TH>Submitted</TH>
                    <TH>Booking</TH>
                    <TH>Resident</TH>
                    <TH>Bed</TH>
                    <TH>Notice date</TH>
                    <TH>Move-out date</TH>
                    <TH>14-day notice?</TH>
                    <TH className="text-right">Fee</TH>
                    <TH className="text-right">Refund</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {res.data.map((v) => (
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
                      <TD className="text-xs text-apg-silver">{formatDate(v.noticeGivenDate)}</TD>
                      <TD className="text-xs text-apg-silver">{formatDate(v.vacatingDate)}</TD>
                      <TD>
                        {v.noticeCompliant ? (
                          <span className="text-emerald-300">Yes</span>
                        ) : (
                          <span className="text-rose-300">No</span>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums text-white">
                        {paiseToInr(v.deductionPaise)}
                      </TD>
                      <TD className="text-right tabular-nums text-white">
                        {v.status === 'completed' ? paiseToInr(v.depositRefundPaise) : '—'}
                      </TD>
                      <TD>
                        <Badge tone={toneForStatus(v.status)}>{titleCase(v.status)}</Badge>
                      </TD>
                      <TD className="text-right">
                        <VacatingRowActions
                          requestId={v.id}
                          status={v.status}
                          settlementHref={settlementHrefByRequest.get(v.id)}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </>
      )}
    </>
  );
}
