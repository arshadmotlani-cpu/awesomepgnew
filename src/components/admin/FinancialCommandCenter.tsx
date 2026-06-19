'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { BillingWhatsAppWithLinkButton } from '@/src/components/admin/BillingWhatsAppWithLinkButton';
import { DepositWalletSummary } from '@/src/components/admin/DepositWalletSummary';
import { paiseToInr } from '@/src/lib/format';
import { isExpressCollectionNote } from '@/src/lib/billing/expressCollectionConstants';
import { buildInvoiceWhatsAppMessage } from '@/src/lib/billing/invoiceWhatsApp';
import type {
  ResidentFinancialCategory,
  ResidentDepositCategory,
  ResidentFinancialLineItem,
  ResidentFinancialSummary,
} from '@/src/lib/billing/residentFinancialTypes';
import {
  generateResidentInvoiceAction,
  type ResidentInvoiceActionState,
} from '@/app/(admin)/admin/residents/[customerId]/invoiceActions';
import type { DepositSummary } from '@/src/services/deposits';

type Props = {
  summary: ResidentFinancialSummary;
  invoiceHistory: Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    amountPaise: number;
    status: string;
    createdAt: Date;
    notes?: string | null;
    paidAt?: Date | null;
  }>;
  /** SSOT deposit wallet from deposit_ledger — always show when provided. */
  depositWallet?: DepositSummary | null;
  bookingId?: string | null;
};

type BillCategory = 'rent' | 'deposit' | 'electricity' | 'custom';

const PRESETS: Array<{ id: string; label: string; categories: BillCategory[] }> = [
  { id: 'rent', label: 'Rent only', categories: ['rent'] },
  { id: 'deposit', label: 'Deposit only', categories: ['deposit'] },
  { id: 'electricity', label: 'Electricity only', categories: ['electricity'] },
  { id: 'custom', label: 'Custom only', categories: ['custom'] },
  { id: 'rent_deposit', label: 'Rent + Deposit', categories: ['rent', 'deposit'] },
  { id: 'rent_electricity', label: 'Rent + Electricity', categories: ['rent', 'electricity'] },
  { id: 'deposit_electricity', label: 'Deposit + Electricity', categories: ['deposit', 'electricity'] },
  {
    id: 'rent_deposit_electricity',
    label: 'Rent + Deposit + Electricity',
    categories: ['rent', 'deposit', 'electricity'],
  },
  { id: 'all', label: 'All outstanding', categories: ['rent', 'deposit', 'electricity', 'custom'] },
];

const idle: ResidentInvoiceActionState = { status: 'idle' };

function categoryItems(
  summary: ResidentFinancialSummary,
  ps4Category: ResidentFinancialCategory,
  otherCategory: ResidentFinancialCategory,
  cat: BillCategory,
): ResidentFinancialLineItem[] {
  switch (cat) {
    case 'rent':
      return summary.rent.items.filter((i) => i.outstandingPaise > 0);
    case 'deposit':
      return summary.deposit.items.filter((i) => i.outstandingPaise > 0);
    case 'electricity':
      return summary.electricity.items.filter((i) => i.outstandingPaise > 0);
    case 'custom':
      return [...otherCategory.items, ...ps4Category.items].filter((i) => i.outstandingPaise > 0);
    default:
      return [];
  }
}

function CategoryTable({
  label,
  category,
  refundablePaise,
  summary,
  onGenerate,
  pending,
}: {
  label: string;
  category: ResidentFinancialCategory | ResidentDepositCategory;
  refundablePaise?: number;
  summary: ResidentFinancialSummary;
  onGenerate: (lineIds?: string[]) => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#12161C] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#FF5A1F]">{label}</p>
        {category.outstandingPaise > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => onGenerate()}
            className="rounded border border-[#FF5A1F]/40 px-2 py-0.5 text-[10px] font-medium text-[#FF5A1F] hover:bg-[#FF5A1F]/10 disabled:opacity-50"
          >
            Generate invoice
          </button>
        ) : null}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-apg-silver">Required</dt>
          <dd className="font-medium text-white">{paiseToInr(category.requiredPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Paid</dt>
          <dd className="font-medium text-emerald-300">{paiseToInr(category.paidPaise)}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Outstanding</dt>
          <dd className="font-semibold text-[#FF5A1F]">{paiseToInr(category.outstandingPaise)}</dd>
        </div>
      </dl>
      {refundablePaise != null && refundablePaise > 0 ? (
        <p className="mt-2 text-[10px] text-sky-300">Refundable: {paiseToInr(refundablePaise)}</p>
      ) : null}
      {category.items.length > 0 ? (
        <ul className="mt-2 space-y-1 border-t border-white/5 pt-2">
          {category.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-apg-silver">{item.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{paiseToInr(item.outstandingPaise)}</span>
                {item.outstandingPaise > 0 && summary.pgId ? (
                  <>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onGenerate([item.id])}
                      className="text-[10px] text-[#FF5A1F] hover:underline disabled:opacity-50"
                    >
                      Invoice
                    </button>
                    <BillingWhatsAppWithLinkButton
                      kind={
                        item.kind === 'deposit'
                          ? 'deposit'
                          : item.kind === 'electricity'
                            ? 'electricity'
                            : 'rent'
                      }
                      residentId={summary.customerId}
                      pgId={summary.pgId}
                      customerName={summary.customerName}
                      phone={summary.customerPhone}
                      pgName={summary.pgName ?? ''}
                      amountPaise={item.outstandingPaise}
                      dueDate={item.dueDate ?? 'soon'}
                      roomNumber={item.roomNumber ?? summary.roomNumber ?? undefined}
                      isOverdue={item.status === 'overdue'}
                    />
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function FinancialCommandCenter({
  summary,
  invoiceHistory,
  depositWallet,
  bookingId,
}: Props) {
  const [state, formAction, pending] = useActionState(generateResidentInvoiceAction, idle);
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<BillCategory>>(
    () => new Set(['rent', 'deposit', 'electricity']),
  );

  const ps4Category: ResidentFinancialCategory = useMemo(
    () => ({
      requiredPaise: summary.other.items
        .filter((i) => i.kind === 'ps4')
        .reduce((a, i) => a + i.requiredPaise, 0),
      paidPaise: summary.other.items
        .filter((i) => i.kind === 'ps4')
        .reduce((a, i) => a + i.paidPaise, 0),
      outstandingPaise: summary.other.items
        .filter((i) => i.kind === 'ps4')
        .reduce((a, i) => a + i.outstandingPaise, 0),
      items: summary.other.items.filter((i) => i.kind === 'ps4'),
    }),
    [summary.other.items],
  );

  const otherCategory: ResidentFinancialCategory = useMemo(
    () => ({
      requiredPaise: summary.other.items
        .filter((i) => i.kind !== 'ps4')
        .reduce((a, i) => a + i.requiredPaise, 0),
      paidPaise: summary.other.items
        .filter((i) => i.kind !== 'ps4')
        .reduce((a, i) => a + i.paidPaise, 0),
      outstandingPaise: summary.other.items
        .filter((i) => i.kind !== 'ps4')
        .reduce((a, i) => a + i.outstandingPaise, 0),
      items: summary.other.items.filter((i) => i.kind !== 'ps4'),
    }),
    [summary.other.items],
  );

  const selectedLines = useMemo(() => {
    const lines: ResidentFinancialLineItem[] = [];
    for (const cat of selectedCategories) {
      lines.push(...categoryItems(summary, ps4Category, otherCategory, cat));
    }
    const seen = new Set<string>();
    return lines.filter((l) => {
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
  }, [selectedCategories, summary, ps4Category, otherCategory]);

  const previewByCategory = useMemo(() => {
    const map: Partial<Record<BillCategory, number>> = {};
    for (const cat of selectedCategories) {
      map[cat] = categoryItems(summary, ps4Category, otherCategory, cat).reduce(
        (a, i) => a + i.outstandingPaise,
        0,
      );
    }
    return map;
  }, [selectedCategories, summary, ps4Category, otherCategory]);

  const previewTotal = selectedLines.reduce((a, l) => a + l.outstandingPaise, 0);

  const whatsappPreview = useMemo(() => {
    if (previewTotal <= 0) return null;
    return buildInvoiceWhatsAppMessage({
      customerName: summary.customerName,
      invoiceNumber: 'PREVIEW',
      amountPaise: previewTotal,
      breakdown: {
        lines: selectedLines.map((l) => ({
          kind: l.kind,
          label: l.label,
          amountPaise: l.outstandingPaise,
        })),
      },
    });
  }, [previewTotal, selectedLines, summary.customerName]);

  function toggleCategory(cat: BillCategory) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function applyPreset(categories: BillCategory[]) {
    setSelectedCategories(new Set(categories));
  }

  function submit(kind: string, lineItemIds?: string[]) {
    setPendingKind(kind);
    const fd = new FormData();
    fd.set('customerId', summary.customerId);
    fd.set('kind', kind);
    if (lineItemIds) lineItemIds.forEach((id) => fd.append('lineItemIds', id));
    formAction(fd);
  }

  function generateCombined() {
    if (selectedLines.length === 0) return;
    submit(
      'combined',
      selectedLines.map((l) => l.id),
    );
  }

  const grandRequired =
    summary.rent.requiredPaise +
    summary.deposit.requiredPaise +
    summary.electricity.requiredPaise +
    summary.other.requiredPaise;
  const grandPaid =
    summary.rent.paidPaise +
    summary.deposit.paidPaise +
    summary.electricity.paidPaise +
    summary.other.paidPaise;

  return (
    <section className="mb-8 rounded-2xl border border-[#FF5A1F]/25 bg-[#1A1F27] p-4 ring-1 ring-[#FF5A1F]/10">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Billing breakdown</h2>
          <p className="text-[10px] text-apg-silver">
            Amounts from your records — rent, deposit, and electricity
          </p>
        </div>
      </div>

      {depositWallet ? (
        <div className="mb-4">
          <DepositWalletSummary wallet={depositWallet} bookingId={bookingId ?? undefined} />
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CategoryTable
          label="Rent"
          category={summary.rent}
          summary={summary}
          onGenerate={(ids) => submit('rent', ids)}
          pending={pending}
        />
        <CategoryTable
          label="Deposit"
          category={summary.deposit}
          refundablePaise={summary.deposit.refundablePaise}
          summary={summary}
          onGenerate={(ids) => submit('deposit', ids)}
          pending={pending}
        />
        <CategoryTable
          label="Electricity"
          category={summary.electricity}
          summary={summary}
          onGenerate={(ids) => submit('electricity', ids)}
          pending={pending}
        />
        {ps4Category.outstandingPaise > 0 ? (
          <CategoryTable
            label="PS4"
            category={ps4Category}
            summary={summary}
            onGenerate={(ids) => submit('ps4', ids)}
            pending={pending}
          />
        ) : null}
        {otherCategory.outstandingPaise > 0 ? (
          <CategoryTable
            label="Other charges"
            category={otherCategory}
            summary={summary}
            onGenerate={(ids) => submit('custom', ids)}
            pending={pending}
          />
        ) : null}
      </div>

      {summary.totals.outstandingPaise > 0 ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-[#12161C] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#FF5A1F]">
            Combined invoice
          </p>
          <p className="mt-1 text-[10px] text-apg-silver">
            Pick what to include in one bill. Duplicate charges are prevented automatically.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.categories)}
                className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-apg-silver hover:border-[#FF5A1F]/40 hover:text-white"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            {(['rent', 'deposit', 'electricity', 'custom'] as BillCategory[]).map((cat) => {
              const amt = categoryItems(summary, ps4Category, otherCategory, cat).reduce(
                (a, i) => a + i.outstandingPaise,
                0,
              );
              if (amt <= 0 && cat !== 'custom') return null;
              if (cat === 'custom' && amt <= 0) return null;
              return (
                <label key={cat} className="flex items-center gap-2 text-apg-silver">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="rounded border-white/20"
                  />
                  <span className="capitalize">{cat}</span>
                  <span className="font-medium text-white">{paiseToInr(amt)}</span>
                </label>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs">
              <p className="font-semibold text-white">Invoice preview</p>
              <ul className="mt-2 space-y-1 text-apg-silver">
                {Object.entries(previewByCategory).map(([cat, amt]) =>
                  amt && amt > 0 ? (
                    <li key={cat} className="flex justify-between">
                      <span className="capitalize">{cat}</span>
                      <span className="text-white">{paiseToInr(amt)}</span>
                    </li>
                  ) : null,
                )}
              </ul>
              <p className="mt-2 border-t border-white/10 pt-2 font-bold text-[#FF5A1F]">
                Total: {paiseToInr(previewTotal)}
              </p>
              <p className="mt-1 text-[10px] text-apg-silver">{selectedLines.length} line(s)</p>
            </div>
            {whatsappPreview ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                <p className="font-semibold text-emerald-200">WhatsApp preview</p>
                <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-[10px] text-apg-silver">
                  {whatsappPreview}
                </pre>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            disabled={pending || previewTotal <= 0}
            onClick={generateCombined}
            className="mt-4 rounded-lg bg-[#FF5A1F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#e04e18] disabled:opacity-50"
          >
            {pending && pendingKind === 'combined'
              ? 'Generating…'
              : `Generate combined invoice (${paiseToInr(previewTotal)})`}
          </button>
        </div>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-apg-silver">Grand required</dt>
            <dd className="font-semibold text-white">{paiseToInr(grandRequired)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Grand paid</dt>
            <dd className="font-semibold text-emerald-300">{paiseToInr(grandPaid)}</dd>
          </div>
          <div>
            <dt className="text-apg-silver">Grand outstanding</dt>
            <dd className="text-base font-bold text-[#FF5A1F]">
              {paiseToInr(summary.totals.outstandingPaise)}
            </dd>
          </div>
        </dl>
      </div>

      {state.status === 'ok' ? (
        <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <p>{state.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.paymentUrl ? (
              <a href={state.paymentUrl} target="_blank" rel="noreferrer" className="underline">
                Payment link →
              </a>
            ) : null}
            {state.whatsappUrl ? (
              <a href={state.whatsappUrl} target="_blank" rel="noreferrer" className="underline">
                WhatsApp →
              </a>
            ) : null}
            {state.invoiceId ? (
              <Link href={`/admin/invoices/${state.invoiceId}`} className="underline">
                View invoice →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      {state.status === 'error' ? (
        <p className="mt-3 text-xs text-rose-300">{state.message}</p>
      ) : null}

      {invoiceHistory.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-apg-silver">
            Invoice history ({invoiceHistory.length})
          </summary>
          <ul className="mt-2 space-y-1 text-[11px]">
            {invoiceHistory.map((inv) => (
              <li key={inv.id} className="flex justify-between gap-2 rounded border border-white/5 px-2 py-1">
                <Link href={`/admin/invoices/${inv.id}`} className="text-white hover:text-[#FF5A1F]">
                  {inv.invoiceNumber} · {inv.invoiceType}
                </Link>
                <span className="text-apg-silver">
                  {paiseToInr(inv.amountPaise)} ·{' '}
                  {isExpressCollectionNote(inv.notes) ? 'Paid (Historical)' : inv.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
