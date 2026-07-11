import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@/src/capital/styles/globals.css';
import { CapitalPwaRegister } from '@/src/capital/components/CapitalPwaRegister';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'Automotive Capital',
    template: '%s · Automotive Capital',
  },
  description: 'Private Automotive Investment Operating System',
  applicationName: 'Automotive Capital',
  manifest: '/capital/manifest.webmanifest',
  icons: { icon: '/capital/icons/favicon.ico' },
  appleWebApp: { capable: true, title: 'Auto Capital' },
};

export default function CapitalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ac-capital-root ac-mesh-bg min-h-screen">
      <CapitalPwaRegister />
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
