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
  icons: {
    icon: [
      { url: '/capital/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/capital/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/capital/icons/favicon.ico', sizes: '32x32' },
      { url: '/capital/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/capital/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/capital/icons/apple-touch.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Automotive Capital',
    description: 'Private Automotive Investment Operating System',
    images: [
      { url: '/og/automotive-capital.png', width: 512, height: 512, alt: 'Automotive Capital' },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Automotive Capital',
    images: ['/og/automotive-capital.png'],
  },
  appleWebApp: { capable: true, title: 'Capital Investments', statusBarStyle: 'black-translucent' },
};

export default function CapitalRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ac-capital-root ac-mesh-bg min-h-screen">
      <CapitalPwaRegister />
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
