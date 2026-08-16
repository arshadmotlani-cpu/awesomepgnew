import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@/src/owner/styles/globals.css';
import { ownerOsMetadata } from '@/src/lib/brand/ownerOsMetadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = ownerOsMetadata;

export default function OwnerRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="oo-root min-h-[100dvh]">
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
