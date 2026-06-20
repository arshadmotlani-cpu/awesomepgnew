import Link from 'next/link';
import { SimpleAccountHub } from '@/src/components/customer/simple/SimpleAccountHub';
import { DocumentsModule } from '@/src/components/customer/account/v2/DocumentsModule';
import { ResidentAreaSection } from '@/src/components/customer/account/ResidentAreaSection';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  parseAccountSection,
  parseResidentTab,
} from '@/src/lib/accountNavigation';
import { formatIndianPhoneDisplay, indianLocalFromE164 } from '@/src/lib/phone';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Account' };

export default async function ProfilePage(
  props: PageProps<'/account/profile'>,
) {
  const session = await requireCustomerSession('/account/profile');
  const ctx = await loadResidentAccountContext(session.customerId);

  if (!ctx) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-rose-700">Account not found.</p>
      </main>
    );
  }

  const sp = await props.searchParams;
  const next = typeof sp.next === 'string' ? sp.next : undefined;
  const bookingCode = typeof sp.booking === 'string' ? sp.booking : undefined;
  const submitted = sp.submitted === '1';
  const section = parseAccountSection(typeof sp.section === 'string' ? sp.section : undefined);
  const residentTab = parseResidentTab(typeof sp.tab === 'string' ? sp.tab : undefined);

  const legacyTabActive = section === 'resident' && residentTab !== 'home';

  if (legacyTabActive && ctx.hasConfirmedBooking) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <nav className="apg-account-nav mb-4 text-xs">
          <Link href="/account/profile">← My account</Link>
        </nav>
        <ResidentAreaSection
          customerId={session.customerId}
          activeTab={residentTab}
          requestsQuery={{
            requestId: typeof sp.request === 'string' ? sp.request : undefined,
            make: sp.make === '1',
          }}
        />
      </main>
    );
  }

  const bookingStatus =
    ctx.hasConfirmedBooking || ctx.isActiveStay ? 'Active' : ('Not booked yet' as const);

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:px-6">
      <nav className="apg-account-nav mb-4 text-xs">
        <Link href="/account/bookings">My bookings</Link>
        <span className="mx-1">/</span>
        <span aria-current="page">My account</span>
      </nav>

      <SimpleAccountHub
        fullName={ctx.customer.fullName}
        email={ctx.customer.email}
        phoneLocal={indianLocalFromE164(ctx.customer.phone) ?? ''}
        phoneDisplay={formatIndianPhoneDisplay(session.phone)}
        bookingStatus={bookingStatus}
        profileComplete={ctx.profileComplete}
        next={next}
        invoices={ctx.invoices.filter((inv) => inv.payHref != null).slice(0, 2)}
        customerPhone={ctx.customer.phone}
      />

      {section === 'identity' ? (
        <div className="mt-8">
          <DocumentsModule
            customerId={session.customerId}
            bookingCode={bookingCode}
            submitted={submitted}
          />
        </div>
      ) : null}
    </main>
  );
}
