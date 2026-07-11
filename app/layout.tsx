import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { VisitorAnalyticsTrackerBoundary } from '@/src/components/analytics/VisitorAnalyticsTrackerBoundary';
import { PostHogProvider } from "@/src/components/analytics/PostHogProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0F14' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'Awesome PG · Premium living beyond ordinary PGs',
    template: '%s · Awesome PG',
  },
  description:
    'Book your exact bed at premium PGs with gaming zones, chill rooms, daily cleaning, free laundry, high-speed WiFi, and honest amenities. Live awesome.',
  applicationName: 'Awesome PG',
  icons: {
    icon: [
      { url: '/icons/apg-favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/apg-favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/apg-favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/apg-admin-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/apg-admin-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apg-apple-touch.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/icons/apg-favicon-32.png',
  },
  openGraph: {
    title: 'Awesome PG',
    description:
      'Premium paying-guest living with bed-first booking and honest amenities.',
    images: [{ url: '/og/awesome-pg.png', width: 512, height: 512, alt: 'Awesome PG' }],
  },
  twitter: {
    card: 'summary',
    title: 'Awesome PG',
    images: ['/og/awesome-pg.png'],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Awesome PG',
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PostHogProvider>
          <VisitorAnalyticsTrackerBoundary />
          {children}
        </PostHogProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
