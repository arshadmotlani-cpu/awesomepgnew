'use client';

import { useCallback, useMemo, useState } from 'react';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import {
  billingRemindersNeedingWhatsApp,
  buildBillingWhatsAppUrl,
  openWhatsAppUrl,
  type BillingReminderQueueItem,
  type BillingWhatsAppKind,
} from '@/src/lib/billing/adminWhatsApp';

type Props = {
  kind: BillingWhatsAppKind;
  items: BillingReminderQueueItem[];
};

const LABELS: Record<
  BillingWhatsAppKind,
  { title: string; button: string }
> = {
  rent: {
    title: 'pending or overdue rent',
    button: 'Remind all via WhatsApp',
  },
  electricity: {
    title: 'unpaid electricity',
    button: 'Remind all via WhatsApp',
  },
};

export function BulkBillingWhatsAppReminder({ kind, items }: Props) {
  const queue = useMemo(() => billingRemindersNeedingWhatsApp(items), [items]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const current = queue[index] ?? null;
  const total = queue.length;
  const done = index >= total;
  const labels = LABELS[kind];

  const buildUrlFor = useCallback(
    (person: BillingReminderQueueItem) =>
      buildBillingWhatsAppUrl({
        kind: person.kind,
        customerName: person.customerName,
        phone: person.phone,
        pgName: person.pgName,
        amountPaise: person.amountPaise,
        dueDate: person.dueDate,
        billingMonth: person.billingMonth,
        roomNumber: person.roomNumber,
        isOverdue: person.isOverdue,
      }),
    [],
  );

  const currentUrl = useMemo(() => {
    if (!current) return null;
    return buildUrlFor(current);
  }, [buildUrlFor, current]);

  const openCurrentWhatsApp = useCallback(() => {
    if (!currentUrl) return;
    openWhatsAppUrl(currentUrl);
  }, [currentUrl]);

  if (total === 0) return null;

  function start() {
    const first = queue[0];
    if (!first) return;
    const url = buildUrlFor(first);
    if (url) openWhatsAppUrl(url);
    setIndex(0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setIndex(0);
  }

  function next() {
    const nextIndex = index + 1;
    if (nextIndex >= total) {
      setOpen(false);
      setIndex(0);
      return;
    }
    const person = queue[nextIndex];
    const url = person ? buildUrlFor(person) : null;
    if (url) openWhatsAppUrl(url);
    setIndex(nextIndex);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-emerald-200">
            {total} {total === 1 ? 'resident has' : 'residents have'} {labels.title}
          </p>
          <p className="mt-0.5 text-xs text-emerald-100/80">
            Opens WhatsApp one by one with the reminder pre-filled — same flow as KYC reminders.
            Tap Send in WhatsApp, then return here for the next person.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ebe57]"
        >
          <WhatsAppIcon className="h-4 w-4" />
          {labels.button} ({total})
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="bulk-billing-wa-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1A1F27] p-5 shadow-xl">
            {done ? (
              <>
                <h2 id="bulk-billing-wa-title" className="text-lg font-semibold text-white">
                  All reminders opened
                </h2>
                <p className="mt-2 text-sm text-apg-silver">
                  You opened WhatsApp for all {total} residents with unpaid {kind}.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 w-full rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-medium text-white"
                >
                  Done
                </button>
              </>
            ) : current ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">
                  Person {index + 1} of {total}
                  {current.isOverdue ? (
                    <span className="ml-2 text-rose-400">· Overdue</span>
                  ) : null}
                </p>
                <h2 id="bulk-billing-wa-title" className="mt-1 text-lg font-semibold text-white">
                  {current.customerName}
                </h2>
                <p className="mt-1 text-sm text-apg-silver">
                  {current.pgName}
                  {current.roomNumber ? ` · Room ${current.roomNumber}` : ''}
                  {current.bedCode ? ` · ${current.bedCode}` : ''}
                </p>
                <p className="mt-1 text-sm text-apg-silver">{current.phone}</p>

                {currentUrl ? (
                  <p className="mt-3 break-all text-xs text-apg-silver">
                    <a
                      href={currentUrl}
                      className="font-medium text-[#25D366] underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in WhatsApp
                    </a>
                  </p>
                ) : (
                  <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    Could not build WhatsApp link — check phone is a valid Indian mobile (+91).
                  </p>
                )}

                <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-apg-silver">
                  Tap <strong className="text-white">Send</strong> in WhatsApp, then come back and
                  tap Next.
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={openCurrentWhatsApp}
                    disabled={!currentUrl}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
                  >
                    <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                    Open WhatsApp again
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    className="flex-1 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1ebe57]"
                  >
                    {index + 1 >= total ? 'Finish' : 'Sent — next person'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={close}
                  className="mt-3 w-full text-center text-sm text-apg-silver hover:text-white"
                >
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
