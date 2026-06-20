import { KycIdentitySection } from '@/src/components/customer/account/KycIdentitySection';
import { ApgCard } from '@/src/components/customer/design-system';

type Props = {
  customerId: string;
  bookingCode?: string;
  submitted?: boolean;
};

/** KYC + downloads — isolated from billing UI. */
export function DocumentsModule({ customerId, bookingCode, submitted }: Props) {
  return (
    <section id="documents" className="scroll-mt-24">
      <ApgCard tier="account" className="overflow-hidden p-0">
        <div className="border-b border-zinc-200 px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-zinc-900">Documents</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Identity verification (KYC) and document uploads — separate from billing.
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <KycIdentitySection
            customerId={customerId}
            bookingCode={bookingCode}
            submitted={submitted}
          />
        </div>
      </ApgCard>
    </section>
  );
}
