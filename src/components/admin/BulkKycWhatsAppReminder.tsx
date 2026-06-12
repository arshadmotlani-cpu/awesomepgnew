'use client';

import { useCallback, useMemo, useState } from 'react';
import { WhatsAppIcon } from '@/src/components/admin/AdminKycWhatsAppButton';
import {
  assignedResidentsNeedingKyc,
  buildKycWhatsAppUrl,
  clientPublicSiteBaseUrl,
  openWhatsAppUrl,
} from '@/src/lib/kyc/adminWhatsApp';
import type { ResidentListRow } from '@/src/services/residentAdmin';

type Props = {
  residents: ResidentListRow[];
};

export function BulkKycWhatsAppReminder({ residents }: Props) {
  const queue = useMemo(() => assignedResidentsNeedingKyc(residents), [residents]);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const current = queue[index] ?? null;
  const total = queue.length;
  const done = index >= total;

  const buildUrlFor = useCallback(
    (person: (typeof queue)[number]) =>
      buildKycWhatsAppUrl({
        customerName: person.fullName,
        phone: person.phone,
        baseUrl: clientPublicSiteBaseUrl(),
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-emerald-900">
            {total} assigned {total === 1 ? 'resident has' : 'residents have'} not completed KYC
          </p>
          <p className="mt-0.5 text-xs text-emerald-800/80">
            Opens WhatsApp one by one with the KYC link pre-filled. Tap Send in WhatsApp, then
            return here for the next person.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#1ebe57]"
        >
          <WhatsAppIcon className="h-4 w-4" />
          Remind all via WhatsApp ({total})
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="bulk-kyc-wa-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            {done ? (
              <>
                <h2 id="bulk-kyc-wa-title" className="text-lg font-semibold text-zinc-900">
                  All reminders opened
                </h2>
                <p className="mt-2 text-sm text-zinc-600">
                  You opened WhatsApp for all {total} assigned residents with pending KYC.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white"
                >
                  Done
                </button>
              </>
            ) : current ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Person {index + 1} of {total}
                </p>
                <h2 id="bulk-kyc-wa-title" className="mt-1 text-lg font-semibold text-zinc-900">
                  {current.fullName}
                </h2>
                {current.pgName ? (
                  <p className="mt-1 text-sm text-zinc-600">
                    {current.pgName} · Room {current.roomNumber} · {current.bedCode}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-zinc-600">{current.phone}</p>

                {currentUrl ? (
                  <p className="mt-3 break-all text-xs text-zinc-500">
                    KYC link:{' '}
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
                  <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    Could not build WhatsApp link — check this person&apos;s phone number is a valid
                    Indian mobile (+91).
                  </p>
                )}

                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                  WhatsApp should open with the KYC message ready. Tap <strong>Send</strong> in
                  WhatsApp, then come back and tap Next.
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={openCurrentWhatsApp}
                    disabled={!currentUrl}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
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
                  className="mt-3 w-full text-center text-sm text-zinc-500 hover:text-zinc-700"
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
