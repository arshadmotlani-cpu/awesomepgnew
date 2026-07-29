import type { Metadata } from 'next';
import { APG_OS, APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';

const iconBase = '/admin-os';

const svgIcon = (file: string, sizes: string) =>
  ({ url: `${iconBase}/${file}`, sizes, type: 'image/svg+xml' }) as const;

export const apgOsAdminIcons: Metadata['icons'] = {
  icon: [
    svgIcon('favicon-16.svg', '16x16'),
    svgIcon('favicon-20.svg', '20x20'),
    svgIcon('favicon-24.svg', '24x24'),
    svgIcon('favicon-32.svg', '32x32'),
    svgIcon('favicon-48.svg', '48x48'),
    svgIcon('icon-64.svg', '64x64'),
    svgIcon('icon-128.svg', '128x128'),
    svgIcon('icon-192.svg', '192x192'),
    svgIcon('icon-512.svg', '512x512'),
  ],
  apple: [svgIcon('apple-touch-icon.svg', '180x180')],
  shortcut: `${iconBase}/favicon-32.svg`,
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
        url: `${iconBase}/og-mark.svg`,
        width: 512,
        height: 512,
        alt: `${APG_OS.name} mark`,
      },
    ],
  },
  other: {
    'msapplication-TileColor': APG_OS_BRAND.color.bgShell,
    'msapplication-TileImage': `${iconBase}/icon-512.svg`,
    'mobile-web-app-capable': 'yes',
  },
};
