'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BillingWhatsAppWithLinkButton } from '@/src/components/admin/BillingWhatsAppWithLinkButton';
import { paiseToInr } from '@/src/lib/format';
import type {
  ResidentFinancialCategory,
  ResidentFinancialLineItem,
  ResidentFinancialSummary,
} from '@/src/lib/billing/residentFinancialTypes';

type Props = {
  summary: ResidentFinancialSummary;
};

function whatsAppKind(item: ResidentFinancialLineItem): 'rent' | 'deposit' | 'electricity' {
  if (item.kind === 'deposit') return 'deposit';
  if (item.kind === 'electricity') return 'electricity';
  return 'rent';
}

function CategoryRow({
  label,
  category,
  subtitle,
  onDrill,
}: {
  label: string;
  category: ResidentFinancialCategory;
  subtitle?: string;
  onDrill: () => void;
}) {
  const clickable = category.outstandingPaise > 0;
  return (
    <tr className="border-b border-white/5">
      <td className="py-2 pr-2">
        <span className="text-xs font-medium text-white">{label}</span>
        {subtitle ? <p className="text-[10px] text-apg-silver">{subtitle}</p> : null}
      </td>
      <td className="py-2 px-2 text-right text-xs text-apg-silver">{paiseToInr(category.requiredPaise)}</td>
      <td className="py-2 px-2 text-right text-xs text-emerald-300/90">{paiseToInr(category.paidPaise)}</td>
      <td className="py-2 pl-2 text-right">
        {clickable ? (
          <button
            type="button"
            onClick={onDrill}
            className="text-xs font-semibold text-[#FF5A1F] hover:underline"
          >
            {paiseToInr(category.outstandingPaise)}
          </button>
        ) : (
          <span className="text-xs text-apg-silver">{paiseToInr(category.outstandingPaise)}</span>
        )}
      </td>
    </tr>
  );
}

function DrilldownPanel({
  title,
  items,
  summary,
  onClose,
}: {
  title: string;
  items: ResidentFinancialLineItem[];
  summary: ResidentFinancialSummary;
  onClose: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-3 rounded-lg border border-white/10 bg-[#12161C] p-3">
        <p className="text-xs text-apg-silver">No outstanding items.</p>
        <button type="button" onClick={onClose} className="mt-2 text-[10px] text-white/50 hover:text-white">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-[#FF5A1F]/30 bg-[#12161C] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-white">{title}</p>
        <button type="button" onClick={onClose} className="text-[10px] text-white/50 hover:text-white">
          Close
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded border border-white/10 p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-white">{item.label}</p>
                {item.invoiceNumber ? (
                  <p className="text-[10px] text-apg-silver">{item.invoiceNumber}</p>
                ) : null}
                {item.dueDate ? (
                  <p className="text-[10px] text-apg-silver">Due {item.dueDate}</p>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-[#FF5A1F]">
                {paiseToInr(item.outstandingPaise)}
              </p>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-apg-silver">
              <span>Required {paiseToInr(item.requiredPaise)}</span>
              <span>Paid {paiseToInr(item.paidPaise)}</span>
              <span>Left {paiseToInr(item.outstandingPaise)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.pgId && item.outstandingPaise > 0 && item.kind !== 'ps4' && item.kind !== 'custom' ? (
                <BillingWhatsAppWithLinkButton
                  kind={whatsAppKind(item)}
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
              ) : null}
              {item.financialInvoiceId ? (
                <Link
                  href={`/admin/invoices/${item.financialInvoiceId}`}
                  className="rounded border border-white/10 px-2 py-1 text-[10px] text-apg-silver hover:text-white"
                >
                  Invoice →
                </Link>
              ) : item.sourceTable === 'rent_invoices' && item.sourceId ? (
                <Link
                  href={`/admin/collections?tab=rent`}
                  className="rounded border border-white/10 px-2 py-1 text-[10px] text-apg-silver hover:text-white"
                >
                  Rent →
                </Link>
              ) : item.sourceTable === 'electricity_invoices' ? (
                <Link
                  href={`/admin/collections?tab=electricity`}
                  className="rounded border border-white/10 px-2 py-1 text-[10px] text-apg-silver hover:text-white"
                >
                  Electricity →
                </Link>
              ) : summary.bookingId ? (
                <Link
                  href={`/admin/deposits/${summary.bookingId}`}
                  className="rounded border border-white/10 px-2 py-1 text-[10px] text-apg-silver hover:text-white"
                >
                  Deposit →
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResidentFinancialSummaryCard({ summary }: Props) {
  const [drill, setDrill] = useState<'rent' | 'deposit' | 'electricity' | 'other' | null>(null);

  const drillItems =
    drill === 'rent'
      ? summary.rent.items
      : drill === 'deposit'
        ? summary.deposit.items
        : drill === 'electricity'
          ? summary.electricity.items
          : drill === 'other'
            ? summary.other.items
            : [];

  const drillTitle =
    drill === 'rent'
      ? 'Rent outstanding'
      : drill === 'deposit'
        ? 'Deposit outstanding'
        : drill === 'electricity'
          ? 'Electricity outstanding'
          : drill === 'other'
            ? 'Other charges'
            : '';

  return (
    <div className="mb-8 rounded-2xl border border-[#FF5A1F]/25 bg-[#1A1F27] p-4 ring-1 ring-[#FF5A1F]/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#FF5A1F]">
            Financial summary
          </p>
          <p className="mt-0.5 text-[10px] text-apg-silver">
            Single source of truth · Required · Paid · Outstanding
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase text-apg-silver">Grand outstanding</p>
          <p className="text-lg font-bold text-white">{paiseToInr(summary.totals.outstandingPaise)}</p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[320px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-apg-silver">
              <th className="pb-2 text-left font-medium">Category</th>
              <th className="pb-2 px-2 text-right font-medium">Required</th>
              <th className="pb-2 px-2 text-right font-medium">Paid</th>
              <th className="pb-2 text-right font-medium">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            <CategoryRow
              label="Rent"
              category={summary.rent}
              onDrill={() => setDrill(drill === 'rent' ? null : 'rent')}
            />
            <CategoryRow
              label="Deposit"
              category={summary.deposit}
              subtitle={
                summary.deposit.refundablePaise > 0
                  ? `Refundable ${paiseToInr(summary.deposit.refundablePaise)}`
                  : undefined
              }
              onDrill={() => setDrill(drill === 'deposit' ? null : 'deposit')}
            />
            <CategoryRow
              label="Electricity"
              category={summary.electricity}
              onDrill={() => setDrill(drill === 'electricity' ? null : 'electricity')}
            />
            <CategoryRow
              label="Other"
              category={summary.other}
              onDrill={() => setDrill(drill === 'other' ? null : 'other')}
            />
            <tr className="border-t border-white/10">
              <td className="pt-2 text-xs font-bold text-white">Total</td>
              <td className="pt-2 px-2 text-right text-xs font-semibold text-white">
                {paiseToInr(summary.totals.requiredPaise)}
              </td>
              <td className="pt-2 px-2 text-right text-xs font-semibold text-emerald-300">
                {paiseToInr(summary.totals.paidPaise)}
              </td>
              <td className="pt-2 text-right text-xs font-bold text-[#FF5A1F]">
                {paiseToInr(summary.totals.outstandingPaise)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {drill ? (
        <DrilldownPanel
          title={drillTitle}
          items={drillItems}
          summary={summary}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </div>
  );
}
