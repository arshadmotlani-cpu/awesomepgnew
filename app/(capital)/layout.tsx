import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@/src/capital/styles/globals.css';
import { CapitalPwaRegister } from '@/src/capital/components/CapitalPwaRegister';
import { capitalOsMetadata } from '@/src/lib/brand/capitalOsMetadata';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = capitalOsMetadata;

export default function CapitalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ac-capital-root ac-mesh-bg min-h-screen">
      <CapitalPwaRegister />
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
