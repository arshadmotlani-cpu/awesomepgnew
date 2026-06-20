import { ProfileForm } from '@/src/components/customer/ProfileForm';
import { ApgCard } from '@/src/components/customer/design-system';
import { AccountPasswordNote } from '@/src/components/customer/account/v2/AccountHeaderBar';

type Props = {
  fullName: string;
  email: string;
  phoneLocal: string;
  profileComplete: boolean;
  next?: string;
};

export function ProfileModule({
  fullName,
  email,
  phoneLocal,
  profileComplete,
  next,
}: Props) {
  return (
    <section id="profile" className="scroll-mt-24">
      <ApgCard tier="account" className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Personal Details</h2>
        <p className="mt-1 text-sm text-zinc-600">Identity and contact information.</p>

        {!profileComplete ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Complete all fields to continue booking or paying.
          </div>
        ) : null}

        <div className="mt-5">
          <ProfileForm
            defaultValues={{ fullName, email, phone: phoneLocal }}
            next={next}
          />
        </div>

        <div className="mt-4">
          <AccountPasswordNote />
        </div>
      </ApgCard>
    </section>
  );
}
