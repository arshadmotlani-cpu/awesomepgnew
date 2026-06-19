import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { ConsoleLedger } from '@/src/components/customer/design-system';
import type { ConsoleLedgerEntry } from '@/src/components/customer/design-system';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { deriveWalletPrimaryAction } from '@/src/lib/residents/walletLedger';
import { paiseToInr } from '@/src/lib/format';
import { residentTabHref } from '@/src/lib/accountNavigation';

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white hover:brightness-110';

export function ResidentWalletView({
  amountDuePaise,
  depositHeldPaise,
  ledgerEntries,
  firstUnpaidRentId,
  firstUnpaidElectricityId,
  historyHref,
}: {
  amountDuePaise: number;
  depositHeldPaise: number;
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

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="account" className="p-5">
        <dl className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-600">
              <GlossaryTip term="Total of rent and electricity bills you still need to pay.">
                Amount you owe
              </GlossaryTip>
            </dt>
            <dd
              className={
                'text-xl font-bold tabular-nums ' +
                (amountDuePaise > 0 ? 'text-[#FF5A1F]' : 'text-zinc-900')
              }
            >
              {paiseToInr(amountDuePaise)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-zinc-600">
              <GlossaryTip term="Security deposit money the PG is holding for you until checkout.">
                Deposit held for you
              </GlossaryTip>
            </dt>
            <dd className="text-xl font-bold tabular-nums text-zinc-900">
              {paiseToInr(depositHeldPaise)}
            </dd>
          </div>
        </dl>
      </ApgCard>

      <Link href={primary.href} className={PRIMARY_BTN}>
        {primary.label}
      </Link>

      <ApgCard tier="account" className="p-5">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-zinc-900">Your statement</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Every deposit and payment in order — like a bank statement.
          </p>
        </header>
        <ConsoleLedger
          entries={ledgerEntries}
          emptyMessage="No money activity yet. Payments and deposits will show here."
        />
      </ApgCard>

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
          <Link
            href={residentTabHref('home')}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Back to home →
          </Link>
        </div>
      </ResidentMoreSection>
    </div>
  );
}
