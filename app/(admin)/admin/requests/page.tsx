import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ResidentRequestReviewPanel } from '@/src/components/admin/ResidentRequestReviewPanel';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { titleCase } from '@/src/lib/format';
import { listAdminRefundQueue } from '@/src/services/adminRefundQueue';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { listPendingResidentRequestsForAdmin } from '@/src/services/residentRequests';
import { syncActionItems } from '@/src/services/actionItems';

export const dynamic = 'force-dynamic';

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string; read?: string }>;
}) {
  const sp = await searchParams;
  await ensureAdminPageNotificationsSeen('/admin/requests', '/admin/requests', sp.read);
  const session = await requireAdminPermission('bookings:write');
  await syncActionItems(session).catch(() => undefined);
  const [refundQueue, legacyRequests] = await Promise.all([
    listAdminRefundQueue(session),
    listPendingResidentRequestsForAdmin(session),
  ]);
  const checkoutItems = refundQueue.filter((i) => i.source === 'checkout_settlement');
  const legacyDepositRequests = legacyRequests.filter((r) => r.type === 'deposit_refund');

  return (
    <>
      <PageHeader
        title="Refund requests"
        description="Checkout settlements are the SSOT for vacating refunds. Legacy resident requests appear only when no checkout settlement exists for that booking."
        actions={
          <Link
            href="/admin/checkout-settlements"
            className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Checkout settlements →
          </Link>
        }
      />

      {sp.reviewed === '1' ? (
        <div className="mb-6 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Request updated — all modules synced.
        </div>
      ) : null}

      {checkoutItems.length > 0 ? (
        <section className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold text-white">
            Checkout settlements ({checkoutItems.length})
          </h2>
          {checkoutItems.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-[#FF5A1F]/30 bg-[#FF5A1F]/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-white">{item.customerName}</p>
                  <p className="text-xs text-apg-silver">
                    {item.pgName} · {item.roomNumber}/{item.bedCode}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-apg-silver">
                    Booking {item.bookingCode}
                  </p>
                </div>
                <Badge tone={item.status === 'refund_pending' ? 'rose' : 'amber'}>
                  {titleCase(item.status.replace(/_/g, ' '))}
                </Badge>
              </div>
              <Link
                href={item.href}
                className="mt-3 inline-flex rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
              >
                Open checkout settlement →
              </Link>
            </article>
          ))}
        </section>
      ) : null}

      {legacyDepositRequests.length === 0 && checkoutItems.length === 0 ? (
        <p className="text-sm text-apg-silver">No open refund work.</p>
      ) : legacyDepositRequests.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-white">
            Legacy resident requests ({legacyDepositRequests.length})
          </h2>
          {await Promise.all(
            legacyDepositRequests.map(async (r) => {
              const depositSummary = await getDepositSummaryForBooking(r.bookingId).catch(
                () => null,
              );
              return (
                <div key={r.id}>
                  <p className="mb-2 text-xs uppercase tracking-wide text-apg-silver">
                    {titleCase(r.type.replace('_', ' '))} · {titleCase(r.status)}
                  </p>
                  <ResidentRequestReviewPanel
                    request={{ ...r, createdAt: r.createdAt }}
                    depositWallet={depositSummary}
                  />
                </div>
              );
            }),
          )}
        </section>
      ) : null}
    </>
  );
}
