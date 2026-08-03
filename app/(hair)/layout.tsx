import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/src/hair/styles/globals.css';
import { HairProviders } from '@/src/hair/components/HairProviders';
import { fyhMetadata } from '@/src/lib/brand/fyhMetadata';

const geistSans = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fyh-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-fyh-mono',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = fyhMetadata;

export default function HairRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${geistSans.variable} ${geistMono.variable} fyh-root fyh-forest-bg`}>
      <HairProviders>
        <Suspense fallback={null}>{children}</Suspense>
      </HairProviders>
    </div>
  );
}
