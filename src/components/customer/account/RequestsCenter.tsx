'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { residentTabHref } from '@/src/lib/accountNavigation';
import { siteWhatsAppUrl } from '@/src/lib/siteContact';
import { ResidentMoreSection } from '@/src/components/customer/account/resident/ResidentMoreSection';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';

export type RequestTypeDef = {
  id: string;
  title: string;
  description: string;
  href?: string;
  whatsappMessage?: string;
  wired: boolean;
  group: 'moveout' | 'room' | 'support';
};

const REQUEST_TYPES: RequestTypeDef[] = [
  {
    id: 'vacating',
    title: 'Give move-out notice',
    description: 'Tell us when you plan to leave so we can prepare checkout.',
    wired: true,
    group: 'moveout',
  },
  {
    id: 'deposit_refund',
    title: 'Deposit refund details',
    description: 'Share bank or UPI details after checkout is approved.',
    wired: true,
    group: 'moveout',
  },
  {
    id: 'late_checkout',
    title: 'Stay longer',
    description: 'Need extra days? Message us — extensions are handled case by case.',
    wired: false,
    whatsappMessage: 'Hi, I need help extending my stay at Awesome PG.',
    group: 'moveout',
  },
  {
    id: 'room_change',
    title: 'Change room',
    description: 'Move to another room in your PG.',
    wired: false,
    whatsappMessage: 'Hi, I would like to request a room change at Awesome PG.',
    group: 'room',
  },
  {
    id: 'bed_change',
    title: 'Change bed',
    description: 'Switch to a different bed in your room.',
    wired: false,
    whatsappMessage: 'Hi, I would like to request a bed change at Awesome PG.',
    group: 'room',
  },
  {
    id: 'early_move_in',
    title: 'Move in early',
    description: 'Arrive before your booked check-in date.',
    wired: false,
    whatsappMessage: 'Hi, I would like to request an early move-in at Awesome PG.',
    group: 'room',
  },
  {
    id: 'weekend_leave',
    title: 'Away for a few days',
    description: 'Register when you will be out of the PG.',
    wired: false,
    whatsappMessage: 'Hi, I would like to register time away from Awesome PG.',
    group: 'room',
  },
  {
    id: 'maintenance',
    title: 'Fix something',
    description: 'AC, plumbing, furniture, or other repairs.',
    wired: false,
    whatsappMessage: 'Hi, I need maintenance help at Awesome PG (please describe the issue).',
    group: 'support',
  },
  {
    id: 'complaint',
    title: 'Raise an issue',
    description: 'Problems with roommates or shared facilities.',
    wired: false,
    whatsappMessage: 'Hi, I would like to report an issue at Awesome PG.',
    group: 'support',
  },
  {
    id: 'visitor',
    title: 'Register a visitor',
    description: 'Let us know when a guest is coming.',
    wired: false,
    whatsappMessage: 'Hi, I would like to register a visitor at Awesome PG.',
    group: 'support',
  },
];

const GROUP_LABELS: Record<RequestTypeDef['group'], string> = {
  moveout: 'Move-out & deposit',
  room: 'Room & stay',
  support: 'Help & repairs',
};

const PRIMARY =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50';

type OpenRequest = {
  id: string;
  type: string;
  status: string;
  createdAt?: string;
};

type Props = {
  bookingId?: string;
  openRequestTypes?: string[];
  openRequests?: OpenRequest[];
  moreContent?: ReactNode;
};

function resolveHref(req: RequestTypeDef, bookingId?: string): string | undefined {
  if (req.id === 'vacating' && bookingId) {
    return `/account/resident/request-vacating/${bookingId}`;
  }
  if (req.id === 'deposit_refund') {
    return residentTabHref('vacating');
  }
  return req.href;
}

function statusLabel(type: string): string {
  if (type === 'deposit_refund') return 'Deposit refund';
  if (type === 'vacating') return 'Move-out notice';
  return type.replace(/_/g, ' ');
}

export function RequestsCenter({
  bookingId,
  openRequestTypes = [],
  openRequests = [],
  moreContent,
}: Props) {
  const openCount = openRequests.length;
  const primaryVacatingHref = bookingId
    ? `/account/resident/request-vacating/${bookingId}`
    : residentTabHref('vacating');

  const groups: RequestTypeDef['group'][] = ['moveout', 'room', 'support'];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">Requests summary</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {openCount === 0
            ? 'No open requests. Start one below when you need something from the office.'
            : `${openCount} request${openCount === 1 ? '' : 's'} waiting for an update.`}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-[10px] font-medium uppercase text-zinc-500">Open now</dt>
            <dd className="mt-1 text-xl font-semibold text-zinc-900">{openCount}</dd>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-[10px] font-medium uppercase text-zinc-500">In the app</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-900">Move-out · Refund</dd>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 col-span-2 sm:col-span-1">
            <dt className="text-[10px] font-medium uppercase text-zinc-500">Other requests</dt>
            <dd className="mt-1 text-sm font-semibold text-zinc-900">Via WhatsApp</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">What to do next</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Most residents start with a{' '}
          <GlossaryTip term="Formal notice that you plan to leave — starts the checkout and deposit refund process.">
            move-out notice
          </GlossaryTip>
          . Everything else is grouped below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={primaryVacatingHref} className={PRIMARY}>
            Create move-out request
          </Link>
          <Link href={residentTabHref('home')} className={SECONDARY}>
            Back to home
          </Link>
          {openCount > 0 ? (
            <a href="#request-history" className={SECONDARY}>
              View open requests
            </a>
          ) : null}
        </div>
      </section>

      {openRequests.length > 0 ? (
        <section id="request-history" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-base font-semibold text-amber-950">Open requests</h2>
          <ul className="mt-3 space-y-2">
            {openRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-zinc-900">{statusLabel(r.type)}</span>
                <StatusChip status="under_review" />
                <span className="w-full text-xs text-zinc-600 capitalize">
                  Status: {r.status.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.map((group) => {
        const items = REQUEST_TYPES.filter((r) => r.group === group);
        const primaryItems = group === 'moveout' ? items : items.slice(0, 2);
        const moreItems = group === 'moveout' ? [] : items.slice(2);

        return (
          <section key={group}>
            <h2 className="mb-3 text-sm font-semibold text-white">{GROUP_LABELS[group]}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {primaryItems.map((req) => (
                <RequestCard
                  key={req.id}
                  req={req}
                  href={resolveHref(req, bookingId)}
                  hasOpen={openRequestTypes.includes(req.id)}
                />
              ))}
            </div>
            {moreItems.length > 0 ? (
              <ResidentMoreSection
                title={`More ${GROUP_LABELS[group].toLowerCase()} requests`}
                className="mt-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {moreItems.map((req) => (
                    <RequestCard
                      key={req.id}
                      req={req}
                      href={resolveHref(req, bookingId)}
                      hasOpen={openRequestTypes.includes(req.id)}
                    />
                  ))}
                </div>
              </ResidentMoreSection>
            ) : null}
          </section>
        );
      })}

      {moreContent ? (
        <ResidentMoreSection title="Deposit refund form" description="Submit after move-out is approved.">
          {moreContent}
        </ResidentMoreSection>
      ) : null}
    </div>
  );
}

function RequestCard({
  req,
  href,
  hasOpen,
}: {
  req: RequestTypeDef;
  href?: string;
  hasOpen: boolean;
}) {
  const waHref = req.whatsappMessage ? siteWhatsAppUrl(req.whatsappMessage) : null;

  return (
    <ApgCard tier="account" className="p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{req.title}</h3>
        {hasOpen ? <StatusChip status="under_review" /> : null}
      </div>
      <p className="mt-2 text-xs text-zinc-600">{req.description}</p>
      {req.wired && href ? (
        <Link
          href={href}
          className="mt-3 inline-flex min-h-[44px] items-center text-xs font-semibold text-[#FF5A1F] hover:underline"
        >
          Open request
        </Link>
      ) : waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-[44px] items-center text-xs font-semibold text-emerald-700 hover:underline"
        >
          Message on WhatsApp
        </a>
      ) : null}
    </ApgCard>
  );
}

export { REQUEST_TYPES };
