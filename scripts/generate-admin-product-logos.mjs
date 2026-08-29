/**
 * Generate admin product logo assets for SOFT, AUTO, and NET WORTH.
 *
 * Two families (PG reference pattern):
 * 1. Header/admin wordmarks — transparent PNG, lettering only, tight bounding box.
 * 2. Favicon/PWA marks — compact 512×512 square marks for 16px/32px tabs.
 *
 * Usage:
 *   node scripts/generate-admin-product-logos.mjs
 *   node scripts/generate-admin-product-logos.mjs --favicons-only
 *   node scripts/generate-admin-product-logos.mjs --wordmarks-only
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const FONT =
  "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

const COLORS = {
  soft: '#7C3AED',
  autoPrimary: '#22D3EE',
  autoAccent: '#F8FAFC',
  netWorth: '#2DD4BF',
  netWorthAccent: '#F8FAFC',
  faviconBg: {
    soft: '#14101F',
    auto: '#081018',
    netWorth: '#0A1218',
  },
};

/** Transparent wordmark SVGs — text only, no background rect. */
export const ADMIN_WORDMARK_MASTERS = {
  soft: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 100" role="img" aria-label="SOFT">
  <text x="180" y="78" text-anchor="middle" dominant-baseline="auto"
    font-family="${FONT}" font-size="86" font-weight="800" fill="${COLORS.soft}" letter-spacing="-0.05em">SOFT</text>
</svg>`,
  auto: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 100" role="img" aria-label="AUTO">
  <text x="180" y="78" text-anchor="middle" dominant-baseline="auto"
    font-family="${FONT}" font-size="86" font-weight="800" letter-spacing="-0.05em">
    <tspan fill="${COLORS.autoAccent}">A</tspan><tspan fill="${COLORS.autoPrimary}">UTO</tspan>
  </text>
</svg>`,
  netWorth: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 100" role="img" aria-label="NET WORTH">
  <text x="310" y="78" text-anchor="middle" dominant-baseline="auto"
    font-family="${FONT}" font-size="72" font-weight="800" letter-spacing="0.06em">
    <tspan fill="${COLORS.netWorthAccent}">NET</tspan><tspan fill="${COLORS.netWorth}"> WORTH</tspan>
  </text>
</svg>`,
};

const RADIUS = 96;

function roundedSquare(bg) {
  return `<rect x="32" y="32" width="448" height="448" rx="${RADIUS}" fill="${bg}"/>`;
}

function textLine({ y, content, fill, size, spacing = '-0.04em' }) {
  return `<text x="256" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="${size}" font-weight="800" fill="${fill}" letter-spacing="${spacing}">${content}</text>`;
}

/** Compact square favicon masters — separate from header wordmarks. */
export const ADMIN_FAVICON_MASTERS = {
  soft: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SOFT">
  ${roundedSquare(COLORS.faviconBg.soft)}
  ${textLine({ y: 276, content: 'SOFT', fill: COLORS.soft, size: 196, spacing: '-0.07em' })}
</svg>`,
  auto: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="AUTO">
  ${roundedSquare(COLORS.faviconBg.auto)}
  <text x="256" y="276" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="196" font-weight="800" letter-spacing="-0.07em">
    <tspan fill="${COLORS.autoAccent}">A</tspan><tspan fill="${COLORS.autoPrimary}">UTO</tspan>
  </text>
</svg>`,
  netWorth: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="NET WORTH">
  ${roundedSquare(COLORS.faviconBg.netWorth)}
  <text x="256" y="268" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="118" font-weight="800" letter-spacing="0.04em">
    <tspan fill="${COLORS.netWorthAccent}">NET</tspan><tspan fill="${COLORS.netWorth}"> WORTH</tspan>
  </text>
</svg>`,
};

const WORDMARK_OUTPUTS = [
  {
    key: 'soft',
    png: 'public/fyh/soft-admin-mark.png',
    svg: 'public/fyh/soft-admin-mark.svg',
    manifestKey: 'soft',
  },
  {
    key: 'auto',
    png: 'public/capital-os/auto-admin-mark.png',
    svg: 'public/capital-os/auto-admin-mark.svg',
    manifestKey: 'auto',
  },
  {
    key: 'netWorth',
    png: 'public/owner-os/net-worth-admin-mark.png',
    svg: 'public/owner-os/net-worth-admin-mark.svg',
    manifestKey: 'netWorth',
  },
];

const SVG_LADDER = [
  'favicon-16.svg',
  'favicon-20.svg',
  'favicon-24.svg',
  'favicon-32.svg',
  'favicon-48.svg',
  'icon-64.svg',
  'icon-128.svg',
  'icon-192.svg',
  'icon-512.svg',
  'apple-touch-icon.svg',
  'mark-filled.svg',
  'og-mark.svg',
];

const FAVICON_OUTPUTS = [
  {
    master: 'soft',
    dir: 'public/fyh',
    pngs: [
      ['favicon-16.png', 16],
      ['favicon-32.png', 32],
      ['favicon-48.png', 48],
      ['icon-64.png', 64],
      ['icon-128.png', 128],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ],
  },
  {
    master: 'soft',
    dir: 'public/fyh/icons',
    pngs: [
      ['favicon-16.png', 16],
      ['favicon-32.png', 32],
      ['apple-touch.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ],
  },
  {
    master: 'auto',
    dir: 'public/capital-os',
    pngs: [
      ['favicon-16.png', 16],
      ['favicon-32.png', 32],
      ['favicon-48.png', 48],
      ['icon-64.png', 64],
      ['icon-128.png', 128],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ],
  },
  {
    master: 'auto',
    dir: 'public/capital/icons',
    pngs: [
      ['favicon-16.png', 16],
      ['favicon-32.png', 32],
      ['icon-48.png', 48],
      ['icon-64.png', 64],
      ['icon-128.png', 128],
      ['apple-touch.png', 180],
      ['icon-192.png', 192],
      ['icon-256.png', 256],
      ['icon-512.png', 512],
      ['icon-1024.png', 1024],
      ['favicon.ico', 32],
    ],
  },
  {
    master: 'netWorth',
    dir: 'public/owner-os',
    pngs: [
      ['favicon-16.png', 16],
      ['favicon-32.png', 32],
      ['favicon-48.png', 48],
      ['icon-64.png', 64],
      ['icon-128.png', 128],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ],
  },
];

/** @type {Record<string, { width: number; height: number }>} */
export const ADMIN_WORDMARK_INTRINSIC = {};

async function renderTrimmedWordmark(svg, destPng, padding = 8) {
  mkdirSync(dirname(join(ROOT, destPng)), { recursive: true });
  const base = sharp(Buffer.from(svg), { density: 300 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .trim({ threshold: 1 });
  const trimmed = await base.toBuffer({ resolveWithObject: true });
  const meta = trimmed.info;
  const padded = await sharp(trimmed.data)
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });
  await sharp(padded.data).toFile(join(ROOT, destPng));
  return {
    width: padded.info.width,
    height: padded.info.height,
    trimmedWidth: meta.width,
    trimmedHeight: meta.height,
  };
}

async function writeSquarePng(svg, dest, size) {
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);
}

async function generateWordmarks() {
  for (const output of WORDMARK_OUTPUTS) {
    const svg = ADMIN_WORDMARK_MASTERS[output.key];
    writeFileSync(join(ROOT, output.svg), svg, 'utf8');
    const dims = await renderTrimmedWordmark(svg, output.png);
    ADMIN_WORDMARK_INTRINSIC[output.manifestKey] = {
      width: dims.width,
      height: dims.height,
    };
    console.log(
      'wordmark',
      output.png,
      `${dims.width}x${dims.height}`,
      `(trimmed ${dims.trimmedWidth}x${dims.trimmedHeight})`,
    );
  }

  const manifestPath = join(ROOT, 'src/lib/brand/adminMarkIntrinsic.json');
  writeFileSync(manifestPath, `${JSON.stringify(ADMIN_WORDMARK_INTRINSIC, null, 2)}\n`, 'utf8');
  console.log('wrote', manifestPath.replace(ROOT + '/', ''));
}

async function generateFavicons() {
  const writtenDirs = new Set();
  for (const output of FAVICON_OUTPUTS) {
    const svg = ADMIN_FAVICON_MASTERS[output.master];
    const absDir = join(ROOT, output.dir);
    mkdirSync(absDir, { recursive: true });

    if (!writtenDirs.has(output.dir)) {
      writeFileSync(join(absDir, 'mark-favicon-master.svg'), svg, 'utf8');
      for (const name of SVG_LADDER) {
        writeFileSync(join(absDir, name), svg, 'utf8');
      }
      writtenDirs.add(output.dir);
    }

    for (const [file, size] of output.pngs) {
      const dest = join(absDir, file);
      await writeSquarePng(svg, dest, size);
      console.log('favicon', dest.replace(ROOT + '/', ''), `${size}x${size}`);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const faviconsOnly = args.has('--favicons-only');
  const wordmarksOnly = args.has('--wordmarks-only');

  if (!faviconsOnly) {
    await generateWordmarks();
  }
  if (!wordmarksOnly) {
    await generateFavicons();
  }
  console.log('✓ Admin product logos generated');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
