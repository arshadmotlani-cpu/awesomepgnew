'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { repairElectricityInvoiceDuplicateAction } from '@/app/(admin)/admin/electricity/duplicates/actions';
import type { ElectricityInvoiceDuplicateGroup } from '@/src/services/electricityInvoiceDuplicates';
import { formatDate, paiseToInr } from '@/src/lib/format';

export function ElectricityDuplicateRepairPanel({
  groups,
}: {
  groups: ElectricityInvoiceDuplicateGroup[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRepair = useCallback(
    (groupKey: string) => {
      const keepInvoiceId = selection[groupKey];
      if (!keepInvoiceId) {
        setError('Select which invoice to keep before repairing.');
        return;
      }
      setError(null);
      setMessage(null);
      startTransition(async () => {
        const result = await repairElectricityInvoiceDuplicateAction({
          groupKey,
          keepInvoiceId,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(
          `Kept invoice and cancelled ${result.cancelledIds.length} duplicate(s).`,
        );
        router.refresh();
      });
    },
    [router, selection],
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-100">
        No duplicate electricity invoices detected. Each resident has at most one active
        invoice per room per billing month.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.groupKey}
          className="rounded-3xl bg-[#1A1F27]/90 p-6 ring-1 ring-amber-400/20"
        >
          <header className="mb-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              Duplicate group
            </p>
            <h2 className="text-lg font-semibold text-white">
              {group.pgName} · Room {group.roomNumber} · {formatDate(group.billingMonth)}
            </h2>
            <p className="text-sm text-apg-silver">{group.customerName}</p>
          </header>

          <ul className="divide-y divide-white/[0.06]">
            {group.invoices.map((inv) => (
              <li key={inv.invoiceId} className="flex flex-wrap items-center gap-4 py-4">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="radio"
                    name={`keep-${group.groupKey}`}
                    value={inv.invoiceId}
                    checked={selection[group.groupKey] === inv.invoiceId}
                    onChange={() =>
                      setSelection((prev) => ({ ...prev, [group.groupKey]: inv.invoiceId }))
                    }
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-white">{inv.invoiceNumber}</span>
                    <span className="block text-xs text-apg-silver">
                      {inv.status} · {paiseToInr(inv.amountPaise)}
                      {inv.paidPaise > 0 ? ` · paid ${paiseToInr(inv.paidPaise)}` : ''}
                      {' · '}
                      {inv.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </span>
                  </span>
                </label>
                <a
                  href={`/admin/billing?tab=electricity&invoice=${inv.invoiceId}`}
                  className="text-xs font-medium text-[#FF5A1F] hover:underline"
                >
                  View invoice
                </a>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs text-apg-silver">
            Marked as duplicate — nothing was auto-deleted. Choose the invoice to keep; others
            will be cancelled and linked to the keeper.
          </p>

          <button
            type="button"
            disabled={pending || !selection[group.groupKey]}
            onClick={() => handleRepair(group.groupKey)}
            className="mt-4 inline-flex rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {pending ? 'Repairing…' : 'Keep selected · cancel others'}
          </button>
        </section>
      ))}
    </div>
  );
}
