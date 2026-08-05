import { ResidentPortalPageSkeleton } from '@/src/components/customer/account/ResidentPortalSkeletons';

export default function ProfileLoading() {
  return (
    <main className="apg-resident-portal-main mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <ResidentPortalPageSkeleton />
    </main>
  );
}
