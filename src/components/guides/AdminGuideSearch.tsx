'use client';

import { useSearchParams } from 'next/navigation';
import { ADMIN_GUIDE } from '@/src/lib/guides/adminGuide';
import { GuideCatalogPanel } from '@/src/components/guides/GuideCatalogPanel';

export function AdminGuideSearch() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  return <GuideCatalogPanel catalog={ADMIN_GUIDE} tone="admin" initialQuery={initialQuery} />;
}
