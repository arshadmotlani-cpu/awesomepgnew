import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { VisitorAnalyticsTrackerBoundary } from '@/src/components/analytics/VisitorAnalyticsTrackerBoundary';
import { PostHogProvider } from "@/src/components/analytics/PostHogProvider";
import { awesomePgCustomerMetadata } from '@/src/lib/brand/awesomePgCustomerMetadata';
import { AWESOME_PG_BRAND } from '@/src/lib/brand/awesomePgTokens';
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
    { media: '(prefers-color-scheme: dark)', color: AWESOME_PG_BRAND.color.charcoal },
  ],
};

export const metadata: Metadata = awesomePgCustomerMetadata;

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
