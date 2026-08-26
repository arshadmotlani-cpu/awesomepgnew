import type { Metadata } from 'next';
import { APG_OS, APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';

const iconBase = '/admin-os';

const pngIcon = (file: string, sizes: string) =>
  ({ url: `${iconBase}/${file}`, sizes, type: 'image/png' }) as const;

export const apgOsAdminIcons: Metadata['icons'] = {
  icon: [
    pngIcon('favicon-16.png', '16x16'),
    pngIcon('favicon-32.png', '32x32'),
    pngIcon('favicon-48.png', '48x48'),
    pngIcon('icon-64.png', '64x64'),
    pngIcon('icon-128.png', '128x128'),
    pngIcon('icon-192.png', '192x192'),
    pngIcon('icon-512.png', '512x512'),
  ],
  apple: [pngIcon('apple-touch-icon.png', '180x180')],
  shortcut: `${iconBase}/favicon-32.png`,
};

/** Shared metadata for all Admin Panel routes (auth + authenticated shell). */
export const apgOsAdminMetadata: Metadata = {
  title: {
    default: APG_OS.name,
    template: `%s · ${APG_OS.name}`,
  },
  description: `${APG_OS.name} — ${APG_OS.subtitle}. ${APG_OS.tagline}`,
  applicationName: APG_OS.name,
  manifest: `${iconBase}/manifest.webmanifest`,
  themeColor: APG_OS_BRAND.color.primary,
  appleWebApp: {
    capable: true,
    title: APG_OS.name,
    statusBarStyle: 'black-translucent',
  },
  icons: apgOsAdminIcons,
  openGraph: {
    title: `${APG_OS.name} · ${APG_OS.subtitle}`,
    description: APG_OS.tagline,
    siteName: APG_OS.name,
    images: [
      {
        url: `${iconBase}/icon-512.png`,
        width: 512,
        height: 512,
        alt: `${APG_OS.name} mark`,
      },
    ],
  },
  other: {
    'msapplication-TileColor': APG_OS_BRAND.color.bgShell,
    'msapplication-TileImage': `${iconBase}/icon-512.png`,
    'mobile-web-app-capable': 'yes',
  },
};
