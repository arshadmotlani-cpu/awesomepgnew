/**
 * Generate square admin favicon / PWA PNG ladders for SOFT, AUTO, and NET WORTH.
 * Matches PG admin-os pattern: compact 1:1 marks (not wide admin-mark PNG letterboxing).
 *
 * Usage: node scripts/generate-admin-product-favicons.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const RADIUS = 96;

function roundedSquare(bg) {
  return `<rect x="32" y="32" width="448" height="448" rx="${RADIUS}" fill="${bg}"/>`;
}

function textLine({ y, content, fill, size, spacing = '-0.04em' }) {
  return `<text x="256" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="${size}" font-weight="800" fill="${fill}" letter-spacing="${spacing}">${content}</text>`;
}

/** PG-style compact square favicon masters — product name only, no wide wordmark plate. */
export const ADMIN_FAVICON_MASTERS = {
  soft: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SOFT">
  ${roundedSquare('#14101F')}
  ${textLine({ y: 268, content: 'SOFT', fill: '#7C3AED', size: 188, spacing: '-0.06em' })}
</svg>`,
  auto: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="AUTO">
  ${roundedSquare('#081018')}
  <text x="256" y="268" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="188" font-weight="800" letter-spacing="-0.06em">
    <tspan fill="#F8FAFC">A</tspan><tspan fill="#22D3EE">UTO</tspan>
  </text>
</svg>`,
  netWorth: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="NET WORTH">
  ${roundedSquare('#0A1218')}
  ${textLine({ y: 214, content: 'NET', fill: '#F8FAFC', size: 118, spacing: '0.12em' })}
  ${textLine({ y: 334, content: 'WORTH', fill: '#2DD4BF', size: 104, spacing: '0.06em' })}
</svg>`,
};

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

const OUTPUTS = [
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

async function writePng(svg, dest, size) {
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);
}

async function main() {
  const writtenDirs = new Set();
  for (const output of OUTPUTS) {
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
      await writePng(svg, dest, size);
      console.log('wrote', dest.replace(ROOT + '/', ''), `${size}x${size}`);
    }
  }
  console.log('✓ Admin product favicons generated');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
