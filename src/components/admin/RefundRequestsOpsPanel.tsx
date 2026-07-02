import Link from 'next/link';
import { refundConsoleHref } from '@/src/lib/refund/refundConsoleLinks';
import { DepositWalletSummary } from '@/src/components/admin/DepositWalletSummary';
import { Badge } from '@/src/components/admin/Badge';
import { paiseToInr, titleCase } from '@/src/lib/format';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { listAdminRefundQueue } from '@/src/services/adminRefundQueue';
import type { AdminSession } from '@/src/lib/auth/session';

export async function RefundRequestsOpsPanel({ session }: { session: AdminSession }) {
  const items = await listAdminRefundQueue(session);

  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
        <h2 className="text-sm font-semibold text-white">Refund requests</h2>
        <p className="mt-2 text-sm text-apg-silver">No open deposit refund requests.</p>
        <Link
          href="/admin/refunds"
          className="mt-3 inline-block text-sm font-medium text-[#FF5A1F] hover:underline"
        >
          Open Refund Console →
        </Link>
      </section>
    );
  }

  const enriched = await Promise.all(
    items.map(async (item) => ({
      ...item,
      wallet:
        item.source === 'resident_request'
          ? await getDepositSummaryForBooking(item.bookingId)
          : null,
    })),
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Refund requests</h2>
          <p className="text-xs text-apg-silver">Checkout settlements and deposit refund requests</p>
        </div>
        <Link
          href="/admin/refunds"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white"
        >
          Refund Console →
        </Link>
      </div>

      <div className="space-y-3">
        {enriched.map((r) => (
          <article
            key={`${r.source}-${r.id}`}
            className={
              'rounded-xl border p-4 ' +
              (r.source === 'checkout_settlement'
                ? 'border-[#FF5A1F]/30 bg-[#FF5A1F]/5'
                : 'border-white/10 bg-[#1A1F27]')
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-white">{r.customerName}</p>
                <p className="text-xs text-apg-silver">
                  {r.pgName} · {r.roomNumber}/{r.bedCode}
                </p>
                <p className="mt-1 font-mono text-[10px] text-apg-silver">
                  Booking {r.bookingCode}
                </p>
              </div>
              <Badge tone={r.status.includes('pending') || r.status === 'submitted' ? 'amber' : 'emerald'}>
                {titleCase(r.status.replace(/_/g, ' '))}
              </Badge>
            </div>

            <p className="mt-2 text-xs text-apg-silver">{r.label}</p>

            {r.wallet ? (
              <div className="mt-3">
                <DepositWalletSummary wallet={r.wallet} bookingId={r.bookingId} compact />
                <p className="mt-2 text-xs text-emerald-300">
                  Refundable now: {paiseToInr(r.wallet.refundableBalancePaise)}
                </p>
              </div>
            ) : null}

            <Link
              href={r.href}
              className="mt-3 inline-flex rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              {r.source === 'checkout_settlement' && r.status === 'refund_pending'
                ? 'Open Refund Console →'
                : r.source === 'checkout_settlement'
                  ? 'Open checkout settlement →'
                  : 'Open Refund Console →'}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
