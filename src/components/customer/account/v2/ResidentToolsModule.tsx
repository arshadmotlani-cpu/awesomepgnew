import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { residentTabHref } from '@/src/lib/accountNavigation';

/** Links to resident sub-flows preserved from v1 — vacating, requests, wallet. */
export function ResidentToolsModule({ bookingCode }: { bookingCode?: string }) {
  const links = [
    { href: residentTabHref('payments'), label: 'Payment history', desc: 'Past rent and electricity payments' },
    { href: residentTabHref('wallet'), label: 'Deposit wallet', desc: 'Wallet statement and credits' },
    { href: residentTabHref('requests'), label: 'Requests', desc: 'Deposit refund, extensions, support' },
    { href: residentTabHref('vacating'), label: 'Move-out', desc: 'Vacating request and settlement' },
    { href: residentTabHref('room'), label: 'My room', desc: 'Room and bed details' },
    {
      href: bookingCode ? `/account/bookings?booking=${bookingCode}` : '/account/bookings',
      label: 'My bookings',
      desc: 'Booking codes and check-in details',
    },
  ];

  return (
    <section id="resident-tools" className="scroll-mt-24">
      <ApgCard tier="account" className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Resident tools</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Advanced flows — move-out, requests, and payment history.
        </p>
        <ul className="mt-4 divide-y divide-zinc-100">
          {links.map((link) => (
            <li key={link.label}>
              <Link href={link.href} className="flex flex-col gap-0.5 py-3 hover:bg-zinc-50/80">
                <span className="text-sm font-medium text-zinc-900">{link.label} →</span>
                <span className="text-xs text-zinc-500">{link.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </ApgCard>
    </section>
  );
}
