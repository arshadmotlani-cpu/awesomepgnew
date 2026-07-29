/**
 * Rasterize brand SVGs to PNG for PWA / PDF / legacy paths.
 * Usage: node scripts/export-brand-from-svg.mjs
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const PRODUCTS = [
  {
    id: 'awesome-pg',
    svgDir: 'public/awesome-pg',
    pngOut: [
      { svg: 'favicon-16.svg', dest: 'public/icons/apg-favicon-16.png', size: 16 },
      { svg: 'favicon-32.svg', dest: 'public/icons/apg-favicon-32.png', size: 32 },
      { svg: 'favicon-48.svg', dest: 'public/icons/apg-favicon-48.png', size: 48 },
      { svg: 'icon-64.svg', dest: 'public/icons/apg-icon-64.png', size: 64 },
      { svg: 'icon-128.svg', dest: 'public/icons/apg-icon-128.png', size: 128 },
      { svg: 'apple-touch-icon.svg', dest: 'public/icons/apg-apple-touch.png', size: 180 },
      { svg: 'icon-192.svg', dest: 'public/icons/apg-admin-192.png', size: 192 },
      { svg: 'icon-512.svg', dest: 'public/icons/apg-admin-512.png', size: 512 },
      { svg: 'icon-512.svg', dest: 'public/icons/apg-icon-256.png', size: 256 },
      { svg: 'icon-512.svg', dest: 'public/icons/apg-icon-1024.png', size: 1024 },
      { svg: 'icon-512.svg', dest: 'public/brand/awesome-pg-256.png', size: 256 },
    ],
  },
  {
    id: 'capital-os',
    svgDir: 'public/capital-os',
    pngOut: [
      { svg: 'favicon-16.svg', dest: 'public/capital/icons/favicon-16.png', size: 16 },
      { svg: 'favicon-32.svg', dest: 'public/capital/icons/favicon-32.png', size: 32 },
      { svg: 'icon-64.svg', dest: 'public/capital/icons/icon-64.png', size: 64 },
      { svg: 'icon-128.svg', dest: 'public/capital/icons/icon-128.png', size: 128 },
      { svg: 'apple-touch-icon.svg', dest: 'public/capital/icons/apple-touch.png', size: 180 },
      { svg: 'icon-192.svg', dest: 'public/capital/icons/icon-192.png', size: 192 },
      { svg: 'icon-512.svg', dest: 'public/capital/icons/icon-512.png', size: 512 },
      { svg: 'icon-512.svg', dest: 'public/capital/icons/icon-256.png', size: 256 },
      { svg: 'icon-512.svg', dest: 'public/capital/icons/icon-1024.png', size: 1024 },
    ],
  },
  {
    id: 'fyh',
    svgDir: 'public/fyh',
    pngOut: [
      { svg: 'favicon-16.svg', dest: 'public/fyh/icons/favicon-16.png', size: 16 },
      { svg: 'favicon-32.svg', dest: 'public/fyh/icons/favicon-32.png', size: 32 },
      { svg: 'icon-192.svg', dest: 'public/fyh/icons/icon-192.png', size: 192 },
      { svg: 'icon-512.svg', dest: 'public/fyh/icons/icon-512.png', size: 512 },
      { svg: 'apple-touch-icon.svg', dest: 'public/fyh/icons/apple-touch.png', size: 180 },
    ],
  },
];

async function rasterize(svgPath, dest, size) {
  if (!existsSync(svgPath)) {
    console.warn('skip missing', svgPath);
    return;
  }
  const svg = readFileSync(svgPath);
  mkdirSync(dirname(join(ROOT, dest)), { recursive: true });
  await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toFile(join(ROOT, dest));
  console.log('wrote', dest, size);
}

async function main() {
  for (const product of PRODUCTS) {
    for (const row of product.pngOut) {
      const svgPath = join(ROOT, product.svgDir, row.svg);
      await rasterize(svgPath, row.dest, row.size);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
