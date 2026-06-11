import Link from 'next/link';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCard } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS, type Ps4PlanId } from '@/src/lib/playstation/plans';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import {
  getMembershipRevenueStats,
  listAdminMemberships,
} from '@/src/services/playstationMembership';
import {
  adminActivateMembershipAction,
  adminCancelMembershipAction,
  adminDeactivateMembershipAction,
  adminExtendMembershipAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPlaystationPage() {
  const [memberships, revenue] = await Promise.all([
    listAdminMemberships(),
    getMembershipRevenueStats(),
  ]);

  return (
    <>
      <PageHeader
        title="PS4 gaming maintenance"
        description={`${PS4_ADDON_LABEL} memberships — separate from rent. Weekly ₹350 · Bi-weekly ₹550 · Monthly ₹750.`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total revenue" value={paiseToInr(revenue.totalRevenuePaise)} />
        <StatCard label="Paid transactions" value={String(revenue.transactionCount)} />
        <StatCard label="Memberships" value={String(memberships.length)} />
      </div>

      {memberships.length === 0 ? (
        <EmptyState
          icon={<IconCard />}
          title="No PS4 memberships yet"
          description="Memberships appear when tenants subscribe or add PS4 during booking checkout."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Resident</TH>
              <TH>PG</TH>
              <TH>Plan</TH>
              <TH>Status</TH>
              <TH className="text-right">Amount</TH>
              <TH>Proof</TH>
              <TH>Valid until</TH>
              <TH>Created</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {memberships.map((m) => (
              <TR key={m.id}>
                <TD>
                  <Link
                    href={`/admin/residents/${m.customerId}`}
                    className="font-medium text-[#FF5A1F] hover:underline"
                  >
                    {m.customerName}
                  </Link>
                </TD>
                <TD className="text-xs">{m.pgName}</TD>
                <TD>{PS4_PLANS[m.plan as Ps4PlanId].label}</TD>
                <TD>{titleCase(m.status.replace('_', ' '))}</TD>
                <TD className="text-right">{paiseToInr(m.amountPaise)}</TD>
                <TD className="text-xs">
                  {m.paymentProofUrl ? (
                    <PaymentScreenshotPreview
                      url={m.paymentProofUrl}
                      viewHref={adminPaymentProofViewUrl('playstation', m.id)}
                      alt={`${m.customerName} PS4 payment proof`}
                      className="h-24 w-24 rounded-lg border border-zinc-200 object-contain bg-zinc-50"
                    />
                  ) : m.status === 'pending_payment' ? (
                    <span className="text-zinc-400">Awaiting payment</span>
                  ) : (
                    '—'
                  )}
                  {m.transactionRef ? (
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{m.transactionRef}</div>
                  ) : null}
                </TD>
                <TD className="text-xs">
                  {m.expiresAt ? formatDate(m.expiresAt) : '—'}
                </TD>
                <TD className="text-xs text-zinc-500">{formatDate(m.createdAt)}</TD>
                <TD className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    {m.status === 'pending_payment' ? (
                      <form action={adminActivateMembershipAction}>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button
                          type="submit"
                          className="rounded border border-emerald-300 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-50"
                        >
                          Activate
                        </button>
                      </form>
                    ) : null}
                    {m.status === 'active' ? (
                      <>
                        <form action={adminExtendMembershipAction}>
                          <input type="hidden" name="membershipId" value={m.id} />
                          <input type="hidden" name="extraDays" value="7" />
                          <button
                            type="submit"
                            className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            +7d
                          </button>
                        </form>
                        <form action={adminDeactivateMembershipAction}>
                          <input type="hidden" name="membershipId" value={m.id} />
                          <button
                            type="submit"
                            className="rounded border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-50"
                          >
                            Deactivate
                          </button>
                        </form>
                      </>
                    ) : null}
                    {m.status !== 'cancelled' ? (
                      <form action={adminCancelMembershipAction}>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button
                          type="submit"
                          className="rounded border border-rose-300 px-2 py-0.5 text-[10px] font-medium text-rose-800 hover:bg-rose-50"
                        >
                          Cancel
                        </button>
                      </form>
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
