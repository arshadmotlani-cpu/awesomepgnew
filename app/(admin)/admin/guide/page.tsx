import { Suspense } from 'react';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { AdminGuideSearch } from '@/src/components/guides/AdminGuideSearch';

export const metadata = {
  title: 'Help guide · Admin',
};

export default function AdminGuidePage() {
  return (
    <>
      <PageHeader
        title="Help guide"
        description="Search any problem or topic — setup, billing, bed map, KYC, collections, vacating, and troubleshooting."
      />
      <Suspense fallback={<p className="text-sm text-apg-silver">Loading guide…</p>}>
        <AdminGuideSearch />
      </Suspense>
    </>
  );
}
