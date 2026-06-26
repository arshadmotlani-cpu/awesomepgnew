import Link from 'next/link';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconCard } from '@/src/components/admin/icons';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import { formatDate, formatDateTime, paiseToInr, titleCase } from '@/src/lib/format';
import { PS4_ADDON_LABEL, PS4_PLANS, ps4PlanRatesSummary, PS4_LOUNGE_HEADLINE, PS4_LOUNGE_HOURLY_NOTE, type Ps4PlanId } from '@/src/lib/playstation/plans';
import { adminPaymentProofViewUrl } from '@/src/lib/payments/proofResponse';
import { PaymentScreenshotPreview } from '@/src/components/admin/PaymentScreenshotPreview';
import {
  getMembershipRevenueStats,
  getMembershipStatusCounts,
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
  const [memberships, revenue, statusCounts] = await Promise.all([
    listAdminMemberships(),
    getMembershipRevenueStats(),
    getMembershipStatusCounts(),
  ]);

  return (
    <>
      <PageHeader
        title="PS4 gaming maintenance"
        description={`${PS4_LOUNGE_HEADLINE} — ${PS4_ADDON_LABEL}, separate from rent. ${PS4_LOUNGE_HOURLY_NOTE} Plans: ${ps4PlanRatesSummary()}.`}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total revenue" value={paiseToInr(revenue.totalRevenuePaise)} />
        <StatCard
          label="Paid activations"
          value={String(revenue.transactionCount)}
          hint="Approved or confirmed payments only"
        />
        <StatCard
          label="Active memberships"
          value={String(statusCounts.active)}
          hint={
            statusCounts.pendingPayment > 0 || statusCounts.cancelled > 0
              ? `${statusCounts.pendingPayment} awaiting payment · ${statusCounts.cancelled} cancelled`
              : undefined
          }
        />
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
              <TH>Starts</TH>
              <TH>Ends</TH>
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
                      className="h-24 w-24 rounded-lg border border-white/10 object-contain bg-white/[0.03]"
                    />
                  ) : m.status === 'pending_payment' ? (
                    <span className="text-apg-silver/70">Awaiting payment</span>
                  ) : (
                    '—'
                  )}
                  {m.transactionRef ? (
                    <div className="mt-0.5 font-mono text-[10px] text-apg-silver">{m.transactionRef}</div>
                  ) : null}
                </TD>
                <TD className="text-xs whitespace-nowrap">
                  {m.startsAt ? formatDateTime(m.startsAt) : '—'}
                </TD>
                <TD className="text-xs whitespace-nowrap">
                  {m.expiresAt ? formatDateTime(m.expiresAt) : '—'}
                </TD>
                <TD className="text-xs text-apg-silver">{formatDate(m.createdAt)}</TD>
                <TD className="text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    {m.status === 'pending_payment' ? (
                      <form action={adminActivateMembershipAction}>
                        <input type="hidden" name="membershipId" value={m.id} />
                        <button
                          type="submit"
                          className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/10"
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
                            className="rounded border border-white/20 px-2 py-0.5 text-[10px] font-medium text-apg-silver hover:bg-white/5"
                          >
                            +7d
                          </button>
                        </form>
                        <form action={adminDeactivateMembershipAction}>
                          <input type="hidden" name="membershipId" value={m.id} />
                          <button
                            type="submit"
                            className="rounded border border-amber-500/40 px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/10"
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
                          className="rounded border border-rose-500/40 px-2 py-0.5 text-[10px] font-medium text-rose-300 hover:bg-rose-500/10"
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#1A1F27] p-4">
      <div className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-apg-silver">{hint}</div> : null}
    </div>
  );
}
