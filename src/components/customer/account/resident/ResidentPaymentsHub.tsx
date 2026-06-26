import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { residentTabHref } from '@/src/lib/accountNavigation';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

export type PaidHistoryRow = {
  id: string;
  label: string;
  amountPaise: number;
  paidAt: string | null;
  status: string;
  invoiceNumber?: string;
};

const BILL_STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-800 ring-rose-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
  'waiting for admin approval': 'bg-sky-50 text-sky-800 ring-sky-200',
};

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white hover:brightness-110';

function primaryPayAction(rows: PaymentDueRow[]): { href: string; label: string } | null {
  const first = rows.find((r) => r.href);
  if (!first?.href) return null;
  if (first.key.startsWith('rent-')) {
    return { href: first.href, label: `Pay rent · ${paiseToInr(first.amountPaise)}` };
  }
  if (first.key.startsWith('elec-')) {
    return { href: first.href, label: `Pay electricity · ${paiseToInr(first.amountPaise)}` };
  }
  return { href: first.href, label: `Pay ${paiseToInr(first.amountPaise)}` };
}

function BillList({
  title,
  description,
  rows,
  emptyMessage,
}: {
  title: string;
  description?: string;
  rows: PaymentDueRow[];
  emptyMessage: string;
}) {
  return (
    <ApgCard tier="account" className="p-5">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {rows.map((row) => (
            <li key={row.key}>
              {row.href ? (
                <Link
                  href={row.href}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 transition hover:bg-zinc-50/80"
                >
                  <BillRowContent row={row} />
                </Link>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <BillRowContent row={row} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </ApgCard>
  );
}

function BillRowContent({ row }: { row: PaymentDueRow }) {
  return (
    <>
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900">{row.label}</p>
        {row.invoiceNumber ? (
          <p className="text-xs text-zinc-500">{row.invoiceNumber}</p>
        ) : null}
        {row.dueDate ? (
          <p className="text-xs text-zinc-500">Due {formatDate(row.dueDate)}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{paiseToInr(row.amountPaise)}</span>
        <StatusChip status={row.status} toneMap={BILL_STATUS_TONE} />
      </div>
    </>
  );
}

export function ResidentPaymentsHub({
  dueRows,
  pendingApprovalRows,
  paidBills,
  historyHref,
}: {
  dueRows: PaymentDueRow[];
  pendingApprovalRows: PaymentDueRow[];
  paidBills: PaidHistoryRow[];
  historyHref: string | null;
}) {
  const payableDue = dueRows.filter((r) => r.href);
  const primary = primaryPayAction(payableDue);
  const payFirst = payableDue[0] ?? null;

  return (
    <div className="space-y-4 pb-2">
      {payFirst ? (
        <ApgCard tier="account" className="overflow-hidden p-0">
          <div className="border-b border-[#FF5A1F]/15 bg-gradient-to-br from-[#FF5A1F]/10 via-white to-white px-5 py-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#FF5A1F]">
              Pay this first
            </p>
            <p className="mt-2 text-xl font-bold text-zinc-900">{payFirst.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-900">
              {paiseToInr(payFirst.amountPaise)}
            </p>
            {payFirst.dueDate ? (
              <p className="mt-2 text-sm text-zinc-600">
                Due {formatDate(payFirst.dueDate)}
                {payFirst.status.toLowerCase().includes('overdue') ? ' · overdue' : ''}
              </p>
            ) : null}
          </div>
        </ApgCard>
      ) : pendingApprovalRows.length === 0 ? (
        <ApgCard tier="account" className="p-5">
          <h2 className="text-base font-semibold text-zinc-900">Due bills</h2>
          <p className="mt-3 text-3xl font-bold tabular-nums text-emerald-700">₹0</p>
          <p className="mt-1 text-sm text-zinc-600">No bills waiting for payment right now.</p>
        </ApgCard>
      ) : null}

      {primary ? (
        <Link href={primary.href} className={PRIMARY_BTN}>
          {primary.label}
        </Link>
      ) : pendingApprovalRows.length > 0 ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Payment submitted — we are reviewing your screenshot.
        </p>
      ) : (
        <Link href={residentTabHref('home')} className={PRIMARY_BTN}>
          All paid — back to home
        </Link>
      )}

      <BillList
        title="Due bills"
        description="Generated invoices waiting for your payment."
        rows={dueRows}
        emptyMessage="Nothing due right now."
      />

      <BillList
        title="Pending approval"
        description="Screenshot uploaded — waiting for admin to confirm payment."
        rows={pendingApprovalRows}
        emptyMessage="No payments awaiting approval."
      />

      <BillList
        title="Paid bills"
        description="Invoices paid in the last 30 days."
        rows={paidBills.map((row) => ({
          key: row.id,
          label: row.label,
          amountPaise: row.amountPaise,
          dueDate: row.paidAt,
          href: null,
          status: row.status,
          invoiceNumber: row.invoiceNumber,
        }))}
        emptyMessage="No paid bills in the last 30 days."
      />

      <ApgCard tier="account" className="p-5">
        <h2 className="text-sm font-semibold text-zinc-900">What happens when you pay</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-zinc-600">
          <li>You review the bill amount and due date.</li>
          <li>You confirm, then pay by UPI and upload a screenshot.</li>
          <li>We verify payment and update your bill status here.</li>
        </ol>
        <p className="mt-3 text-xs text-zinc-500">
          <GlossaryTip term="A small extra charge added if you pay after the due date.">
            Late fee
          </GlossaryTip>{' '}
          details are always shown on the review screen before you confirm.
        </p>
      </ApgCard>

      <ResidentMoreSection title="Invoice history" description="Full payment and invoice archive.">
        <div className="flex flex-wrap gap-2">
          {historyHref ? (
            <Link
              href={historyHref}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              View invoice history →
            </Link>
          ) : null}
          <Link
            href={residentTabHref('wallet')}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Wallet statement →
          </Link>
        </div>
      </ResidentMoreSection>
    </div>
  );
}

/** Read-only invoice breakdown rows for pay review screens. */
export function InvoiceBreakdownRow({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: 'danger' | 'success';
}) {
  const valueClass =
    tone === 'danger'
      ? 'text-rose-700'
      : tone === 'success'
        ? 'text-emerald-700'
        : emphasis
          ? 'font-semibold text-zinc-900'
          : 'text-zinc-900';

  return (
    <>
      <dt className={emphasis ? 'text-base font-semibold text-zinc-900' : 'text-sm text-zinc-600'}>
        {label}
      </dt>
      <dd className={`text-right text-sm ${valueClass}`}>{value}</dd>
    </>
  );
}

export function invoiceStatusLabel(status: string): string {
  return titleCase(status.replace(/_/g, ' '));
}
