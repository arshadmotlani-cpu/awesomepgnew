'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { ProfileForm } from '@/src/components/customer/ProfileForm';
import { SimpleInvoiceCard } from '@/src/components/customer/simple/SimpleInvoiceCard';
import type { ResidentBookingRow } from '@/src/db/queries/customer';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';
import { formatStayDateTime } from '@/src/lib/residents/stayBillingRules';
import { paiseToInr } from '@/src/lib/format';
import type { ResidentInvoiceCard } from '@/src/services/residentAccountContext';

type TabId = 'profile' | 'stay' | 'payments' | 'invoices';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: '🧍' },
  { id: 'stay', label: 'My Stay', icon: '🏠' },
  { id: 'payments', label: 'Payments', icon: '💳' },
  { id: 'invoices', label: 'Invoices', icon: '🧾' },
];

type Props = {
  fullName: string;
  email: string;
  phoneLocal: string;
  phoneDisplay: string;
  bookingStatus: 'Active' | 'Not booked yet';
  profileComplete: boolean;
  isActiveStay: boolean;
  initialTab?: TabId;
  next?: string;
  invoices: ResidentInvoiceCard[];
  customerPhone: string;
  primaryBooking: ResidentBookingRow | null;
  financialSummary: ResidentFinancialSummary | null;
  depositStatusLabel: string;
};

export function SimpleAccountHub({
  fullName,
  email,
  phoneLocal,
  phoneDisplay,
  bookingStatus,
  profileComplete,
  isActiveStay,
  initialTab = 'profile',
  next,
  invoices,
  customerPhone,
  primaryBooking,
  financialSummary,
  depositStatusLabel,
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);

  const stayLabel = isActiveStay
    ? 'Active'
    : bookingStatus === 'Active'
      ? 'Upcoming'
      : 'Not booked';

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <header className="rounded-2xl border border-white/10 apg-glass-light p-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-apg-muted">My account</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{fullName || 'Your name'}</h1>
        <p className="mt-1 text-base text-apg-silver">{phoneDisplay}</p>
      </header>

      <nav
        className="sticky top-14 z-20 -mx-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#0a0f18]/95 p-1 backdrop-blur-md"
        aria-label="Account sections"
      >
        <ul className="flex min-w-min gap-1">
          {TABS.map((item) => {
            const active = tab === item.id;
            const hidden =
              item.id !== 'profile' && bookingStatus === 'Not booked yet';
            if (hidden) return null;
            return (
              <li key={item.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={
                    'flex w-full min-h-[44px] flex-col items-center justify-center rounded-xl px-2 py-2 text-[11px] font-semibold transition ' +
                    (active
                      ? 'bg-apg-orange/20 text-white ring-1 ring-apg-orange/40'
                      : 'text-apg-silver hover:bg-white/5 hover:text-white')
                  }
                >
                  <span aria-hidden className="text-base leading-none">
                    {item.icon}
                  </span>
                  <span className="mt-1">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {tab === 'profile' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 apg-glass-light p-5">
            <h2 className="text-lg font-bold text-white">Your details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-apg-silver">Name</dt>
                <dd className="font-medium text-white">{fullName || '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-apg-silver">Phone</dt>
                <dd className="font-medium text-white">{phoneDisplay}</dd>
              </div>
              {email ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-apg-silver">Email</dt>
                  <dd className="truncate font-medium text-white">{email}</dd>
                </div>
              ) : null}
            </dl>
            <a
              href="#edit-profile"
              className="mt-5 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/15 text-sm font-semibold text-white hover:border-apg-orange/40"
            >
              Edit profile
            </a>
          </div>

          <section
            id="edit-profile"
            className="scroll-mt-6 rounded-2xl border border-white/10 apg-glass-light p-5"
          >
            <h2 className="text-lg font-bold text-white">Update details</h2>
            {!profileComplete ? (
              <p className="mt-2 text-sm text-amber-200">Fill everything so you can book.</p>
            ) : null}
            <div className="mt-4">
              <ProfileForm defaultValues={{ fullName, email, phone: phoneLocal }} next={next} />
            </div>
            <p className="mt-3 text-xs text-apg-muted">
              <Link href="/account/change-password" className="text-apg-cyan hover:text-apg-orange">
                Change password
              </Link>
            </p>
          </section>

          <div className="flex justify-center">
            <LogoutButton scope="customer" tone="dark" />
          </div>
        </section>
      ) : null}

      {tab === 'stay' ? (
        <section className="rounded-2xl border border-white/10 apg-glass-light p-5">
          <h2 className="text-lg font-bold text-white">My stay</h2>
          {primaryBooking ? (
            <>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Status</p>
                <p
                  className={
                    'mt-1 text-lg font-bold ' +
                    (isActiveStay ? 'text-emerald-300' : 'text-sky-300')
                  }
                >
                  {stayLabel}
                </p>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-apg-silver">PG</dt>
                  <dd className="text-right font-medium text-white">{primaryBooking.pgName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-apg-silver">Room</dt>
                  <dd className="font-medium text-white">{primaryBooking.roomNumber}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-apg-silver">Bed</dt>
                  <dd className="font-medium text-white">{primaryBooking.bedCode}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-apg-silver">Check-in</dt>
                  <dd className="text-right font-medium text-white">
                    {formatStayDateTime(primaryBooking.checkInDate, 'check-in')}
                  </dd>
                </div>
                {primaryBooking.expectedCheckoutDate ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-apg-silver">Check-out</dt>
                    <dd className="text-right font-medium text-white">
                      {formatStayDateTime(primaryBooking.expectedCheckoutDate, 'check-out')}
                    </dd>
                  </div>
                ) : (
                  <div className="flex justify-between gap-3">
                    <dt className="text-apg-silver">Stay type</dt>
                    <dd className="font-medium text-white">Continue living</dd>
                  </div>
                )}
              </dl>
              <Link
                href={`/booking/${primaryBooking.bookingCode}`}
                className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-white/15 text-sm font-semibold text-white hover:border-apg-orange/40"
              >
                View booking
              </Link>
              <p className="mt-3 text-center text-xs text-apg-muted">
                <Link
                  href="/account/profile?section=resident&tab=home"
                  className="text-apg-cyan hover:text-apg-orange"
                >
                  Move-out &amp; requests →
                </Link>
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-apg-silver">No stay yet.</p>
          )}
        </section>
      ) : null}

      {tab === 'payments' ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 apg-glass-light p-5">
            <h2 className="text-lg font-bold text-white">Payments</h2>
            {financialSummary ? (
              <dl className="mt-4 space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-apg-muted">Rent</dt>
                  <dd className="mt-1 text-xl font-bold text-white">
                    {paiseToInr(financialSummary.rent.outstandingPaise)}
                    <span className="ml-1 text-xs font-normal text-apg-silver">due</span>
                  </dd>
                  <p className="mt-1 text-xs text-apg-muted">
                    Paid {paiseToInr(financialSummary.rent.paidPaise)} of{' '}
                    {paiseToInr(financialSummary.rent.requiredPaise)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-apg-muted">
                    Electricity
                  </dt>
                  <dd className="mt-1 text-xl font-bold text-white">
                    {paiseToInr(financialSummary.electricity.outstandingPaise)}
                    <span className="ml-1 text-xs font-normal text-apg-silver">due</span>
                  </dd>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-apg-muted">
                    Deposit
                  </dt>
                  <dd className="mt-1 text-xl font-bold text-white">
                    {paiseToInr(financialSummary.deposit.paidPaise)}
                    <span className="ml-1 text-xs font-normal text-apg-silver">held</span>
                  </dd>
                  <p className="mt-1 text-xs text-apg-muted">{depositStatusLabel}</p>
                  {financialSummary.deposit.refundablePaise > 0 ? (
                    <p className="mt-1 text-xs text-emerald-200">
                      Refundable: {paiseToInr(financialSummary.deposit.refundablePaise)}
                    </p>
                  ) : null}
                </div>
                {financialSummary.totals.outstandingPaise > 0 ? (
                  <div className="rounded-xl border border-apg-orange/30 bg-apg-orange/10 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
                      Total due
                    </dt>
                    <dd className="mt-1 text-2xl font-bold text-white">
                      {paiseToInr(financialSummary.totals.outstandingPaise)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-4 text-sm text-apg-silver">Payment history appears after booking.</p>
            )}
          </div>
          {invoices.some((inv) => inv.payHref) ? (
            <p className="text-center text-xs text-apg-muted">
              Open the Invoices tab to pay or share on WhatsApp.
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === 'invoices' ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Invoices</h2>
          {invoices.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-apg-silver">
              No invoices yet. They appear here after your first bill.
            </p>
          ) : (
            invoices.map((inv) => (
              <SimpleInvoiceCard
                key={inv.id}
                invoice={inv}
                customerName={fullName}
                customerPhone={customerPhone}
                stayDaysLabel={inv.stayDurationLabel}
                variant="dark"
              />
            ))
          )}
        </section>
      ) : null}

      {bookingStatus === 'Not booked yet' ? (
        <Link
          href="/pgs"
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-apg-orange text-base font-bold text-white"
        >
          Find a PG to book
        </Link>
      ) : null}
    </div>
  );
}
