import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Cormorant_Garamond, Outfit } from 'next/font/google';
import '@/src/hair/styles/globals.css';
import { HairProviders } from '@/src/hair/components/HairProviders';

const display = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-fyh-display',
  display: 'swap',
});

const sans = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-fyh-sans',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: {
    default: 'For Your Hair ERP',
    template: '%s · For Your Hair ERP',
  },
  description: 'Luxury Salon ERP — For Your Hair',
  applicationName: 'For Your Hair ERP',
};

export default function HairRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${sans.variable} fyh-root fyh-forest-bg`}>
      <HairProviders>
        <Suspense fallback={null}>{children}</Suspense>
      </HairProviders>
    </div>
  );
}
