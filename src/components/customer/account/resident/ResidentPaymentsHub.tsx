import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import { residentTabHref } from '@/src/lib/accountNavigation';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

const BILL_STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  overdue: 'bg-rose-50 text-rose-800 ring-rose-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  processing: 'bg-sky-50 text-sky-800 ring-sky-200',
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

export function ResidentPaymentsHub({
  billRows,
  historyHref,
}: {
  billRows: PaymentDueRow[];
  historyHref: string | null;
}) {
  const dueRows = billRows.filter((r) => r.href);
  const totalDue = dueRows.reduce((s, r) => s + r.amountPaise, 0);
  const primary = primaryPayAction(dueRows);
  const nextBill = dueRows[0] ?? null;

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="account" className="p-5">
        <h2 className="text-base font-semibold text-zinc-900">What you owe</h2>
        <p className="mt-3 text-3xl font-bold tabular-nums text-zinc-900">
          {paiseToInr(totalDue)}
        </p>
        {nextBill ? (
          <p className="mt-1 text-sm text-zinc-600">
            Next: {nextBill.label}
            {nextBill.dueDate ? ` · due ${formatDate(nextBill.dueDate)}` : ''}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-600">No bills waiting right now.</p>
        )}
      </ApgCard>

      {primary ? (
        <Link href={primary.href} className={PRIMARY_BTN}>
          {primary.label}
        </Link>
      ) : (
        <Link href={residentTabHref('home')} className={PRIMARY_BTN}>
          All paid — back to home
        </Link>
      )}

      {dueRows.length > 0 ? (
        <ApgCard tier="account" className="p-5">
          <h2 className="text-base font-semibold text-zinc-900">Bills waiting</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Tap a bill to review the full breakdown before you pay.
          </p>
          <ul className="mt-4 divide-y divide-zinc-100">
            {dueRows.map((row) => (
              <li key={row.key}>
                <Link
                  href={row.href!}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 transition hover:bg-zinc-50/80"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{row.label}</p>
                    <p className="text-xs text-zinc-500">
                      {row.dueDate ? `Due ${formatDate(row.dueDate)}` : 'Due soon'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{paiseToInr(row.amountPaise)}</span>
                    <StatusChip
                      status={row.status.toLowerCase().replace(/\s+/g, '_')}
                      toneMap={BILL_STATUS_TONE}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </ApgCard>
      ) : null}

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

      <ResidentMoreSection title="More" description="History and wallet.">
        <div className="flex flex-wrap gap-2">
          {historyHref ? (
            <Link
              href={historyHref}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Payment history →
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
