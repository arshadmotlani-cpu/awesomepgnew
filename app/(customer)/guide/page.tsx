import { Suspense } from 'react';
import { CustomerGuideTabs } from '@/src/components/guides/CustomerGuideTabs';

export const metadata = {
  title: 'Guides · Awesome PG',
  description:
    'How to book a PG bed and how to pay rent, electricity, KYC, and manage your resident account.',
};

export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Suspense
        fallback={
          <p className="text-sm text-apg-silver">Loading guide…</p>
        }
      >
        <CustomerGuideTabs />
      </Suspense>
    </div>
  );
}
