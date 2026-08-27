import type { Metadata } from 'next';

export const OWNER_OS = {
  name: 'Owner OS',
  tagline: 'Your financial life operating system',
  host: 'owner.awesomepg.in',
} as const;

const iconBase = '/owner-os';

const pngIcon = (file: string, sizes: string) =>
  ({ url: `${iconBase}/${file}`, sizes, type: 'image/png' }) as const;

export const ownerOsIcons: Metadata['icons'] = {
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

export const ownerOsMetadata: Metadata = {
  title: {
    default: OWNER_OS.name,
    template: `%s · ${OWNER_OS.name}`,
  },
  description: OWNER_OS.tagline,
  applicationName: OWNER_OS.name,
  manifest: `${iconBase}/manifest.webmanifest`,
  themeColor: '#FF5A1F',
  icons: ownerOsIcons,
  openGraph: {
    title: OWNER_OS.name,
    description: OWNER_OS.tagline,
    images: [
      {
        url: `${iconBase}/icon-512.png`,
        width: 512,
        height: 512,
        alt: 'NET WORTH',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: OWNER_OS.name,
    statusBarStyle: 'black-translucent',
  },
};
