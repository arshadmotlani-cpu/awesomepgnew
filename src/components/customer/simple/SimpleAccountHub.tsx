'use client';

import Link from 'next/link';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { ProfileForm } from '@/src/components/customer/ProfileForm';
import { SimpleInvoiceCard } from '@/src/components/customer/simple/SimpleInvoiceCard';
import type { ResidentInvoiceCard } from '@/src/services/residentAccountContext';

type Props = {
  fullName: string;
  email: string;
  phoneLocal: string;
  phoneDisplay: string;
  bookingStatus: 'Active' | 'Not booked yet';
  profileComplete: boolean;
  next?: string;
  invoices?: ResidentInvoiceCard[];
  customerPhone: string;
  showEditForm?: boolean;
};

/** Ultra-simple account — name, phone, status, edit, sign out. */
export function SimpleAccountHub({
  fullName,
  email,
  phoneLocal,
  phoneDisplay,
  bookingStatus,
  profileComplete,
  next,
  invoices = [],
  customerPhone,
}: Props) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="rounded-2xl border border-white/10 apg-glass-light p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-apg-muted">My Account</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{fullName || 'Your name'}</h1>
        <p className="mt-1 text-base text-apg-silver">{phoneDisplay}</p>
        <p className="mt-4 text-sm text-apg-silver">
          Booking status:{' '}
          <span
            className={
              'font-bold ' + (bookingStatus === 'Active' ? 'text-emerald-300' : 'text-apg-orange')
            }
          >
            {bookingStatus}
          </span>
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <a
            href="#edit-profile"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-apg-orange/40"
          >
            Edit Profile
          </a>
          <LogoutButton scope="customer" tone="dark" />
        </div>
      </header>

      <section id="edit-profile" className="scroll-mt-6 rounded-2xl border border-white/10 apg-glass-light p-5">
        <h2 className="text-lg font-bold text-white">Edit your details</h2>
        {!profileComplete ? (
          <p className="mt-2 text-sm text-amber-200">Please fill everything so you can book.</p>
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

      {invoices.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-white">Your bill</h2>
          {invoices.slice(0, 3).map((inv) => (
            <SimpleInvoiceCard
              key={inv.id}
              invoice={inv}
              customerName={fullName}
              customerPhone={customerPhone}
              stayDaysLabel={inv.stayDurationLabel}
            />
          ))}
          {bookingStatus === 'Active' ? (
            <p className="text-center text-xs text-apg-muted">
              <Link href="/account/profile?section=resident&tab=payments" className="text-apg-cyan">
                See all payments →
              </Link>
            </p>
          ) : null}
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
