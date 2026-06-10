import Link from 'next/link';
import { ProfileForm } from '@/src/components/customer/ProfileForm';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import { indianLocalFromE164 } from '@/src/lib/phone';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Your profile' };

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
  const complete = isProfileComplete(customer);

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <nav className="text-xs text-zinc-500">
        <Link href="/account/bookings" className="hover:text-indigo-600">
          My bookings
        </Link>
        <span className="mx-1">/</span>
        <span className="text-zinc-700">Profile</span>
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Your profile</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Booking and payment require name, email, and mobile on file. After payment
          you&apos;ll complete KYC before check-in.
        </p>
      </header>

      {!complete ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
    </main>
  );
}
