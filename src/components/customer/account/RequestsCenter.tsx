'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { accountProfileHref } from '@/src/lib/accountNavigation';
import { residentTabHref } from '@/src/lib/accountNavigation';

export type RequestTypeDef = {
  id: string;
  title: string;
  description: string;
  href?: string;
  wired: boolean;
  status?: string;
};

const REQUEST_TYPES: RequestTypeDef[] = [
  {
    id: 'vacating',
    title: 'Vacating',
    description: 'Submit notice and start checkout settlement.',
    wired: true,
  },
  {
    id: 'room_change',
    title: 'Room change',
    description: 'Request a move to another room in your PG.',
    wired: false,
  },
  {
    id: 'bed_change',
    title: 'Bed change',
    description: 'Switch to a different bed in your room.',
    wired: false,
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    description: 'Report repairs — AC, plumbing, furniture.',
    wired: false,
  },
  {
    id: 'complaint',
    title: 'Complaint',
    description: 'Raise an issue with roommates or facilities.',
    wired: false,
  },
  {
    id: 'deposit_refund',
    title: 'Deposit refund',
    description: 'Submit bank details for refund after checkout.',
    wired: true,
  },
  {
    id: 'weekend_leave',
    title: 'Weekend leave',
    description: 'Register an approved away period.',
    wired: false,
  },
  {
    id: 'visitor',
    title: 'Visitor',
    description: 'Pre-register a guest visit.',
    wired: false,
  },
  {
    id: 'early_move_in',
    title: 'Early move-in',
    description: 'Request check-in before your booked date.',
    wired: false,
  },
  {
    id: 'late_checkout',
    title: 'Late checkout',
    description: 'Extend your stay beyond notice period.',
    wired: true,
  },
];

type Props = {
  bookingId?: string;
  bookingCode?: string;
  openRequestTypes?: string[];
};

export function RequestsCenter({ bookingId, bookingCode, openRequestTypes = [] }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {REQUEST_TYPES.map((req) => {
        let href = req.href;
        if (req.id === 'vacating' && bookingId) {
          href = `/account/resident/request-vacating/${bookingId}`;
        } else if (req.id === 'deposit_refund') {
          href = residentTabHref('vacating');
        } else if (req.id === 'late_checkout') {
          href = accountProfileHref('resident', { tab: 'requests' });
        }
        const hasOpen = openRequestTypes.includes(req.id);

        return (
          <ApgCard key={req.id} tier="account" className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900">{req.title}</h3>
              {hasOpen ? <StatusChip status="under_review" /> : null}
              {!req.wired ? (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-200">
                  Soon
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-zinc-600">{req.description}</p>
            {req.wired && href ? (
              <Link
                href={href}
                className="mt-3 inline-flex min-h-[44px] items-center text-xs font-semibold text-indigo-700 hover:text-indigo-600"
              >
                Open request →
              </Link>
            ) : (
              <p className="mt-3 text-xs text-zinc-400">
                Contact support via WhatsApp for now — in-app form coming soon.
              </p>
            )}
          </ApgCard>
        );
      })}
    </div>
  );
}

export { REQUEST_TYPES };
