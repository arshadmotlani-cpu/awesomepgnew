'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { ConsoleLedger } from '@/src/components/customer/design-system';
import type { ConsoleLedgerEntry } from '@/src/components/customer/design-system';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { deriveWalletPrimaryAction } from '@/src/lib/residents/walletLedger';
import { buildWalletTimelineView } from '@/src/lib/residents/walletPresentation';
import { paiseToInr } from '@/src/lib/format';
import { residentTabHref } from '@/src/lib/accountNavigation';

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white hover:brightness-110';

function LedgerSection({
  title,
  description,
  entries,
  emptyMessage,
}: {
  title: string;
  description: string;
  entries: ConsoleLedgerEntry[];
  emptyMessage: string;
}) {
  if (entries.length === 0) return null;

  return (
    <ApgCard tier="account" className="p-5">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </header>
      <ConsoleLedger entries={entries} emptyMessage={emptyMessage} />
    </ApgCard>
  );
}

export function ResidentWalletView({
  amountDuePaise,
  depositHeldPaise,
  availableCreditPaise = 0,
  ledgerEntries,
  firstUnpaidRentId,
  firstUnpaidElectricityId,
  historyHref,
}: {
  amountDuePaise: number;
  depositHeldPaise: number;
  availableCreditPaise?: number;
  ledgerEntries: ConsoleLedgerEntry[];
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
  historyHref: string | null;
}) {
  const primary = deriveWalletPrimaryAction({
    amountDuePaise,
    firstUnpaidRentId,
    firstUnpaidElectricityId,
    historyHref,
  });
  const timeline = buildWalletTimelineView(ledgerEntries);

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="account" className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your wallet</p>
        <dl className="mt-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-600">
              <GlossaryTip term="Total of rent and electricity bills you still need to pay.">
                Amount you owe
              </GlossaryTip>
            </dt>
            <dd
              className={
                'text-2xl font-bold tabular-nums ' +
                (amountDuePaise > 0 ? 'text-[#FF5A1F]' : 'text-zinc-900')
              }
            >
              {paiseToInr(amountDuePaise)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-600">
              <GlossaryTip term="Security deposit money the PG is holding for you until checkout.">
                Deposit position
              </GlossaryTip>
            </dt>
            <dd className="text-2xl font-bold tabular-nums text-zinc-900">
              {paiseToInr(depositHeldPaise)}
            </dd>
          </div>
          {availableCreditPaise > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-zinc-600">
                <GlossaryTip term="Deposit credit you can apply toward charges or transfer when eligible.">
                  Available deposit credit
                </GlossaryTip>
              </dt>
              <dd className="text-xl font-bold tabular-nums text-emerald-800">
                {paiseToInr(availableCreditPaise)}
              </dd>
            </div>
          ) : null}
        </dl>
      </ApgCard>

      {timeline.refundStatus ? (
        <ApgCard tier="account" className="border-emerald-200/80 bg-emerald-50/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            Refund status
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-900">{timeline.refundStatus.label}</p>
          <p className="mt-1 text-xs text-emerald-800">{timeline.refundStatus.detail}</p>
        </ApgCard>
      ) : null}

      <Link href={primary.href} className={PRIMARY_BTN}>
        {primary.label}
      </Link>

      <LedgerSection
        title="Money received"
        description="Deposits collected and refunds sent to you."
        entries={timeline.moneyIn}
        emptyMessage="No money received yet."
      />

      <LedgerSection
        title="Money paid out"
        description="Rent, electricity, and other charges you paid."
        entries={timeline.moneyOut}
        emptyMessage="No payments recorded yet."
      />

      {ledgerEntries.length > 0 &&
      timeline.moneyIn.length === 0 &&
      timeline.moneyOut.length === 0 ? (
        <ApgCard tier="account" className="p-5">
          <header className="mb-4">
            <h2 className="text-base font-semibold text-zinc-900">Full timeline</h2>
            <p className="mt-1 text-sm text-zinc-600">All wallet activity in date order.</p>
          </header>
          <ConsoleLedger
            entries={ledgerEntries}
            emptyMessage="No money activity yet. Payments and deposits will show here."
          />
        </ApgCard>
      ) : null}

      <ResidentMoreSection title="More" description="Other wallet links.">
        <div className="flex flex-wrap gap-2">
          {historyHref ? (
            <Link
              href={historyHref}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Full payment history →
            </Link>
          ) : null}
          <Link
            href={residentTabHref('payments')}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Bills & payments →
          </Link>
        </div>
      </ResidentMoreSection>
    </div>
  );
}
