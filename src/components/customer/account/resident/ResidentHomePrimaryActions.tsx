import Link from 'next/link';
import { accountProfileHref, residentTabHref } from '@/src/lib/accountNavigation';
import { paiseToInr } from '@/src/lib/format';

const PRIMARY =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50';

export type HomePrimaryAction = {
  key: string;
  href: string;
  label: string;
  primary?: boolean;
};

export function buildHomePrimaryActions(input: {
  kycStatus: string;
  documentsSubmitted: boolean;
  totalDuePaise: number;
  depositDuePaise: number;
  depositPaymentLinkUrl: string | null;
  firstUnpaidRentId: string | null;
  firstUnpaidElectricityId: string | null;
  openRequestCount: number;
  hasOpenVacating: boolean;
}): HomePrimaryAction[] {
  const actions: HomePrimaryAction[] = [];

  if (input.kycStatus !== 'approved') {
    actions.push({
      key: 'identity',
      href: accountProfileHref('identity'),
      label: input.documentsSubmitted ? 'Identity under review' : 'Complete identity check',
      primary: true,
    });
  } else if (input.totalDuePaise > 0) {
    if (input.depositDuePaise > 0 && input.depositPaymentLinkUrl) {
      actions.push({
        key: 'pay-deposit',
        href: input.depositPaymentLinkUrl,
        label: `Pay security deposit (${paiseToInr(input.depositDuePaise)})`,
        primary: true,
      });
    } else if (input.firstUnpaidRentId) {
      actions.push({
        key: 'pay-rent',
        href: `/account/resident/pay-rent/${input.firstUnpaidRentId}`,
        label: `Pay rent (${paiseToInr(input.totalDuePaise)})`,
        primary: true,
      });
    } else if (input.firstUnpaidElectricityId) {
      actions.push({
        key: 'pay-electricity',
        href: `/account/resident/pay-electricity/${input.firstUnpaidElectricityId}`,
        label: 'Pay electricity bill',
        primary: true,
      });
    } else {
      actions.push({
        key: 'payments',
        href: residentTabHref('payments'),
        label: `Pay ${paiseToInr(input.totalDuePaise)} due`,
        primary: true,
      });
    }
  } else if (input.hasOpenVacating || input.openRequestCount > 0) {
    actions.push({
      key: 'requests',
      href: residentTabHref('requests'),
      label: input.hasOpenVacating ? 'View move-out request' : 'View open requests',
      primary: true,
    });
  } else {
    actions.push({
      key: 'room',
      href: residentTabHref('room'),
      label: 'View my room',
      primary: true,
    });
  }

  if (input.totalDuePaise > 0 && actions[0]?.key !== 'payments') {
    actions.push({
      key: 'all-payments',
      href: residentTabHref('payments'),
      label: 'All bills & payments',
    });
  }

  actions.push({ key: 'wallet', href: residentTabHref('wallet'), label: 'Wallet' });
  actions.push({ key: 'requests-nav', href: residentTabHref('requests'), label: 'Requests' });

  return actions.slice(0, 5);
}

export function ResidentHomePrimaryActions({ actions }: { actions: HomePrimaryAction[] }) {
  const hint =
    actions[0]?.key === 'identity'
      ? 'Finish identity check before check-in — upload Aadhaar and a selfie.'
      : actions[0]?.key === 'pay-deposit' || actions[0]?.key === 'pay-rent' || actions[0]?.key === 'pay-electricity'
        ? 'Pay on time to avoid late fees. You can also use the Payments tab for every bill.'
        : actions[0]?.key === 'requests'
          ? 'We will update you when your request moves forward.'
          : 'You are caught up on payments. Use the tabs below for bills, wallet, and requests.';

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">What to do next</h2>
      <p className="mt-1 text-sm text-zinc-600">{hint}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            key={action.key}
            href={action.href}
            className={action.primary ? PRIMARY : SECONDARY}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
