import Link from 'next/link';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { isExpressCollectionNote } from '@/src/lib/billing/expressCollectionConstants';
import { isMonthlyStayType } from '@/src/lib/stayType';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import type { DepositSummary } from '@/src/services/deposits';
import type { ResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27] p-5';

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  amountPaise: number;
  status: string;
  createdAt: Date;
  notes?: string | null;
  paidAt?: Date | null;
};

function depositStatusLabel(
  financialSummary: ResidentFinancialSummary | null,
  depositSummary: DepositSummary | null,
): string {
  const outstanding = financialSummary?.deposit.outstandingPaise ?? 0;
  const required = financialSummary?.deposit.requiredPaise ?? 0;
  const paid = depositSummary?.collectedPaise ?? financialSummary?.deposit.paidPaise ?? 0;

  if (required <= 0) return 'Not required';
  if (outstanding > 0) return `${paiseToInr(outstanding)} due`;
  if (depositSummary && depositSummary.refundableBalancePaise > 0) {
    return `Paid · ${paiseToInr(depositSummary.refundableBalancePaise)} held`;
  }
  return paid > 0 ? `Paid (${paiseToInr(paid)})` : 'Paid';
}

function invoiceTypeLabel(type: string): string {
  switch (type) {
    case 'rent':
      return 'Rent';
    case 'electricity':
      return 'Electricity';
    case 'deposit':
      return 'Deposit';
    case 'custom':
      return 'Other';
    default:
      return titleCase(type.replace(/_/g, ' '));
  }
}

function invoiceStatusLabel(status: string, notes?: string | null): string {
  if (isExpressCollectionNote(notes)) return 'Paid';
  if (status === 'paid') return 'Paid';
  if (status === 'pending_approval') return 'Awaiting approval';
  if (status === 'pending' || status === 'overdue') return 'Pending';
  return titleCase(status);
}

export function ResidentFinancialSSOTPanel({
  activeTenancy,
  billingDefaults,
  financialSummary,
  depositSummary,
  invoiceHistory,
}: {
  activeTenancy: {
    pgName: string;
    roomNumber: string;
    bedCode: string;
    moveInDate: string;
    stayType?: string | null;
    durationMode?: string | null;
  };
  billingDefaults: ResidentBillingFormDefaults | null;
  financialSummary: ResidentFinancialSummary | null;
  depositSummary: DepositSummary | null;
  invoiceHistory: InvoiceRow[];
}) {
  const monthlyStay = isMonthlyStayType(activeTenancy.stayType ?? activeTenancy.durationMode);
  const currentDues = financialSummary?.totals.outstandingPaise ?? 0;
  const latestInvoices = invoiceHistory.slice(0, 8);

  return (
    <section id="financial" className={`${SURFACE} mb-8 scroll-mt-6`}>
      <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
        Financial summary
      </p>
      <p className="mt-1 text-xs text-apg-silver">
        Single source of truth — same invoice records as Billing Center, Revenue, and Collections.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Current room"
          value={`${activeTenancy.pgName} · Room ${activeTenancy.roomNumber} · ${activeTenancy.bedCode}`}
        />
        <Stat label="Check-in date" value={formatDate(activeTenancy.moveInDate)} />
        {monthlyStay ? (
          <Stat
            label="Next rent due"
            value={
              billingDefaults?.nextRentDueDate
                ? formatDate(billingDefaults.nextRentDueDate)
                : '—'
            }
            accent
          />
        ) : null}
        <Stat label="Deposit status" value={depositStatusLabel(financialSummary, depositSummary)} />
        <Stat
          label="Current dues"
          value={paiseToInr(currentDues)}
          warn={currentDues > 0}
          accent={currentDues === 0}
        />
      </dl>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Latest invoices</h3>
          <Link
            href="/admin/billing"
            className="text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            Open Billing Center →
          </Link>
        </div>

        {latestInvoices.length === 0 ? (
          <p className="mt-2 text-sm text-apg-silver">No invoices yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-apg-silver">
                  <th className="py-2 pr-4">Invoice</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {latestInvoices.map((inv) => {
                  const statusLabel = invoiceStatusLabel(inv.status, inv.notes);
                  const tone =
                    statusLabel === 'Paid'
                      ? 'emerald'
                      : statusLabel === 'Awaiting approval'
                        ? 'amber'
                        : toneForStatus(inv.status);
                  return (
                    <tr key={inv.id}>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/admin/invoices/${inv.id}`}
                          className="font-medium text-[#FF5A1F] hover:underline"
                        >
                          {inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-apg-silver">
                        {invoiceTypeLabel(inv.invoiceType)}
                      </td>
                      <td className="py-2 pr-4 text-apg-silver">
                        {formatDate(inv.createdAt)}
                      </td>
                      <td className="py-2 pr-4 text-white">{paiseToInr(inv.amountPaise)}</td>
                      <td className="py-2">
                        <Badge tone={tone}>{statusLabel}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#12161C] px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={`mt-1 text-sm font-semibold ${
          warn ? 'text-amber-200' : accent ? 'text-emerald-300' : 'text-white'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
