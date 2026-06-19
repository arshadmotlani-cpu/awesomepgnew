import Link from 'next/link';
import { Badge } from '@/src/components/admin/Badge';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { CheckoutSettlementsPrimaryActions } from '@/src/components/admin/checkout/CheckoutSettlementsPrimaryActions';
import { CheckoutSettlementsSummary } from '@/src/components/admin/checkout/CheckoutSettlementsSummary';
import { requireAdminPermission } from '@/src/lib/auth/guards';
import { titleCase } from '@/src/lib/format';
import {
  listCheckoutSettlements,
  type CheckoutSettlementListTab,
} from '@/src/services/checkoutSettlement';

export const dynamic = 'force-dynamic';

const TABS: Array<{ id: CheckoutSettlementListTab; label: string }> = [
  { id: 'awaiting_resident', label: 'Waiting on resident' },
  { id: 'awaiting_review', label: 'Ready for your review' },
  { id: 'refund_pending', label: 'Refund to send' },
  { id: 'completed', label: 'Done' },
  { id: 'archived', label: 'Archived' },
];

export default async function CheckoutSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAdminPermission('deposits:write');
  const sp = await searchParams;
  const tab = TABS.some((t) => t.id === sp.tab)
    ? (sp.tab as CheckoutSettlementListTab)
    : 'awaiting_resident';

  const rows = await listCheckoutSettlements(session, tab);

  return (
    <>
      <PageHeader
        title="Checkout settlements"
        description="Finish move-out: security deposit, notice fee, electricity, and refund — one resident at a time."
      />

      <CheckoutSettlementsSummary tab={tab} count={rows.length} />
      <CheckoutSettlementsPrimaryActions tab={tab} count={rows.length} />

      <section id="settlement-queue" className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-white">Settlement queue</h2>
        <nav className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/admin/checkout-settlements?tab=${t.id}`}
              className={
                tab === t.id
                  ? 'rounded-lg bg-[#FF5A1F] px-3 py-1.5 text-xs font-semibold text-white'
                  : 'rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-apg-silver hover:text-white'
              }
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
          No settlements in this queue.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase text-apg-silver">
              <tr>
                <th className="px-4 py-3">Resident</th>
                <th className="px-4 py-3">PG / bed</th>
                <th className="px-4 py-3">Move-out date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{r.customerName}</p>
                    <p className="text-xs text-apg-silver">{r.bookingCode}</p>
                  </td>
                  <td className="px-4 py-3 text-apg-silver">
                    {r.pgName} · R{r.roomNumber} · {r.bedCode}
                  </td>
                  <td className="px-4 py-3 text-apg-silver">{r.vacatingDate}</td>
                  <td className="px-4 py-3">
                    <Badge tone="amber">{plainStatus(r.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/checkout-settlements/${r.id}`}
                      className="text-sm font-semibold text-[#FF5A1F] hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function plainStatus(status: string) {
  switch (status) {
    case 'awaiting_resident_details':
      return 'Waiting on resident';
    case 'awaiting_admin_review':
      return 'Ready for your review';
    case 'refund_pending':
      return 'Refund to send';
    case 'refund_paid':
      return 'Refund sent';
    case 'completed':
      return 'Done';
    case 'archived':
      return 'Archived';
    default:
      return titleCase(status.replace(/_/g, ' '));
  }
}
