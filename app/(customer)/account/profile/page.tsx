import Link from 'next/link';
import { ProfileForm } from '@/src/components/customer/ProfileForm';
import { AccountSectionNav } from '@/src/components/customer/account/AccountSectionNav';
import { ApplicationStatusTracker } from '@/src/components/customer/account/ApplicationStatusTracker';
import { ResidentUnlockCelebration } from '@/src/components/customer/account/ResidentUnlockCelebration';
import { KycIdentitySection } from '@/src/components/customer/account/KycIdentitySection';
import { ProfilePhoto } from '@/src/components/customer/account/ProfilePhoto';
import { ResidentAreaSection } from '@/src/components/customer/account/ResidentAreaSection';
import {
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
  ACCOUNT_LINK_ON_DARK,
} from '@/src/components/customer/accountStyles';
import { customerHasConfirmedBooking } from '@/src/db/queries/customer';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { parseAccountSection, parseResidentTab, accountProfileHref } from '@/src/lib/accountNavigation';
import { formatIndianPhoneDisplay, indianLocalFromE164 } from '@/src/lib/phone';
import { getCustomerById, isProfileComplete, canCheckIn } from '@/src/services/profile';
import { getLatestKycSubmission } from '@/src/services/kyc';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { KycCheckInBanner } from '@/src/components/customer/KycCheckInBanner';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your account' };

export default async function ProfilePage(
  props: PageProps<'/account/profile'>,
) {
  const session = await requireCustomerSession('/account/profile');
  const customer = await getCustomerById(session.customerId);
  if (!customer) {
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
  let section = parseAccountSection(typeof sp.section === 'string' ? sp.section : undefined);
  const residentTab = parseResidentTab(typeof sp.tab === 'string' ? sp.tab : undefined);

  const confirmed = await customerHasConfirmedBooking(session.customerId);
  const showResident = confirmed.ok && confirmed.data;
  if (section === 'resident' && !showResident) {
    section = 'profile';
  }

  const complete = isProfileComplete(customer);
  const latestKyc = await getLatestKycSubmission(session.customerId);
  const documentsSubmitted =
    customer.kycStatus === 'pending' &&
    latestKyc != null &&
    latestKyc.status === 'pending';
  const checkInAllowed = canCheckIn(customer);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <nav className="apg-account-nav text-xs">
        <Link href="/account/bookings">My bookings</Link>
        <span className="mx-1">/</span>
        <span aria-current="page">Profile</span>
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <h1 className={ACCOUNT_PAGE_TITLE}>Your account</h1>
            <p className={ACCOUNT_PAGE_SUBTITLE}>
              Signed in as {session.fullName} · {formatIndianPhoneDisplay(session.phone)}.
              Manage profile, identity verification, and resident billing in one place.
            </p>
          </div>
          <ProfilePhoto
            fullName={customer.fullName}
            kycSubmissionId={latestKyc?.id ?? null}
          />
        </div>
        <LogoutButton scope="customer" tone="dark" />
      </header>

      {!checkInAllowed && section !== 'identity' ? (
        <div className="mt-4">
          <KycCheckInBanner
            kycStatus={customer.kycStatus}
            bookingCode={bookingCode}
            documentsSubmitted={documentsSubmitted}
          />
        </div>
      ) : null}

      <AccountSectionNav
        active={section}
        showResident={showResident}
        bookingCode={bookingCode}
      />

      {!showResident && section !== 'resident' ? (
        <div className="mt-6">
          <ApplicationStatusTracker
            profileComplete={complete}
            kycStatus={customer.kycStatus}
            hasConfirmedBooking={showResident}
            depositPaid={showResident}
            isResident={showResident}
          />
        </div>
      ) : null}

      {section === 'profile' ? (
        <section className="mt-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Contact details</h2>
            <p className="mt-1 text-sm text-apg-silver">
              Required for booking and payment. After payment, complete{' '}
              <Link href={accountProfileHref('identity')} className={ACCOUNT_LINK_ON_DARK}>
                Identity (KYC)
              </Link>{' '}
              before check-in.
            </p>
          </div>

          {!complete ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Complete all fields below to continue booking or paying.
            </div>
          ) : null}

          <ProfileForm
            defaultValues={{
              fullName: customer.fullName,
              email: customer.email,
              phone: indianLocalFromE164(customer.phone) ?? '',
            }}
            next={next}
          />

          <p className="text-sm text-apg-silver">
            <Link href="/account/change-password" className={ACCOUNT_LINK_ON_DARK}>
              Change password
            </Link>
            {' · '}
            Sign in with email and password — codes are only sent when you sign up or forget your
            password.
          </p>

          {showResident ? (
            <p className="text-sm text-apg-silver">
              Monthly rent, electricity, and vacating →{' '}
              <Link href={accountProfileHref('resident')} className={ACCOUNT_LINK_ON_DARK}>
                Resident area
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      {section === 'identity' ? (
        <KycIdentitySection
          customerId={session.customerId}
          bookingCode={bookingCode}
          submitted={submitted}
        />
      ) : null}

      {section === 'resident' && showResident ? (
        <>
          <ResidentUnlockCelebration
            customerId={session.customerId}
            residentName={session.fullName || customer.fullName}
          />
          <ResidentAreaSection
            customerId={session.customerId}
            activeTab={residentTab}
            requestsQuery={{
              requestId: typeof sp.request === 'string' ? sp.request : undefined,
              make: sp.make === '1',
            }}
          />
        </>
      ) : null}
    </main>
  );
}
