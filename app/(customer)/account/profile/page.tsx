import Link from 'next/link';
import { AccountHeaderBar } from '@/src/components/customer/account/v2/AccountHeaderBar';
import {
  AccountModuleNav,
  AccountSectionScrollSync,
} from '@/src/components/customer/account/v2/AccountModuleNav';
import { ProfileModule } from '@/src/components/customer/account/v2/ProfileModule';
import { ResidencyJourneyModule } from '@/src/components/customer/account/v2/ResidencyJourneyModule';
import { BillingOverviewModule } from '@/src/components/customer/account/v2/BillingOverviewModule';
import { InvoiceListModule } from '@/src/components/customer/account/v2/InvoiceListModule';
import { DepositRefundModule } from '@/src/components/customer/account/v2/DepositRefundModule';
import { DocumentsModule } from '@/src/components/customer/account/v2/DocumentsModule';
import { ResidentToolsModule } from '@/src/components/customer/account/v2/ResidentToolsModule';
import { ResidentAreaSection } from '@/src/components/customer/account/ResidentAreaSection';
import { ResidentUnlockCelebration } from '@/src/components/customer/account/ResidentUnlockCelebration';
import { KycCheckInBanner } from '@/src/components/customer/KycCheckInBanner';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  parseAccountSection,
  parseResidentTab,
} from '@/src/lib/accountNavigation';
import { formatIndianPhoneDisplay, indianLocalFromE164 } from '@/src/lib/phone';
import { canCheckIn } from '@/src/services/profile';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Account' };

function legacyScrollTarget(section: string, tab: string): string | null {
  if (section === 'identity') return 'documents';
  if (section === 'profile') return 'profile';
  if (section === 'resident') {
    if (tab === 'wallet' || tab === 'payments') return tab === 'wallet' ? 'deposit' : 'invoices';
    if (tab === 'home') return 'billing';
  }
  return null;
}

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

  const latestKyc = await getLatestKycSubmission(session.customerId);
  const documentsSubmitted =
    ctx.customer.kycStatus === 'pending' &&
    latestKyc != null &&
    latestKyc.status === 'pending';
  const checkInAllowed = canCheckIn(ctx.customer);

  const legacyTabActive = section === 'resident' && residentTab !== 'home';
  const scrollTarget = legacyScrollTarget(section, residentTab);

  if (legacyTabActive && ctx.hasConfirmedBooking) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
        <nav className="apg-account-nav mb-4 text-xs">
          <Link href="/account/bookings">My bookings</Link>
          <span className="mx-1">/</span>
          <Link href="/account/profile">My account</Link>
          <span className="mx-1">/</span>
          <span aria-current="page">Resident</span>
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

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <AccountSectionScrollSync targetId={scrollTarget} />

      <nav className="apg-account-nav mb-4 text-xs">
        <Link href="/account/bookings">My bookings</Link>
        <span className="mx-1">/</span>
        <span aria-current="page">My account</span>
      </nav>

      <div className="space-y-6">
        <AccountHeaderBar
          fullName={session.fullName || ctx.customer.fullName}
          phoneDisplay={formatIndianPhoneDisplay(session.phone)}
          residentStatusLabel={ctx.journey.residentStatusLabel}
        />

        {!checkInAllowed ? (
          <KycCheckInBanner
            kycStatus={ctx.customer.kycStatus}
            bookingCode={bookingCode}
            documentsSubmitted={documentsSubmitted}
          />
        ) : null}

        <AccountModuleNav showBilling={ctx.hasConfirmedBooking} />

        {ctx.hasConfirmedBooking ? (
          <ResidentUnlockCelebration
            customerId={session.customerId}
            residentName={session.fullName || ctx.customer.fullName}
          />
        ) : null}

        <ProfileModule
          fullName={ctx.customer.fullName}
          email={ctx.customer.email}
          phoneLocal={indianLocalFromE164(ctx.customer.phone) ?? ''}
          profileComplete={ctx.profileComplete}
          next={next}
        />

        <ResidencyJourneyModule journey={ctx.journey} />

        {ctx.financialSummary ? (
          <>
            <BillingOverviewModule
              summary={ctx.financialSummary}
              pgName={ctx.financialSummary.pgName}
              roomNumber={ctx.financialSummary.roomNumber}
            />
            <InvoiceListModule
              invoices={ctx.invoices}
              customerName={ctx.customer.fullName}
              customerPhone={ctx.customer.phone}
            />
            {ctx.primaryBooking ? (
              <DepositRefundModule
                bookingId={ctx.primaryBooking.bookingId}
                depositPaidPaise={ctx.depositPaidPaise}
                depositHeldPaise={ctx.depositHeldPaise}
                depositRefundablePaise={ctx.depositRefundablePaise}
                depositOutstandingPaise={ctx.depositOutstandingPaise}
                depositStatusLabel={ctx.depositStatusLabel}
                showRefundForm={ctx.customer.residencyStatus === 'vacated' || ctx.journey.steps.find((s) => s.id === 'active_stay')?.status === 'done'}
              />
            ) : null}
            <ResidentToolsModule bookingCode={ctx.primaryBooking?.bookingCode ?? bookingCode} />
          </>
        ) : null}

        <DocumentsModule
          customerId={session.customerId}
          bookingCode={bookingCode}
          submitted={submitted}
        />
      </div>
    </main>
  );
}
