/**
 * Export crisp multi-size branding icons from 1024 masters.
 * Usage: node scripts/export-brand-icons.mjs
 */
import sharp from 'sharp';
import { mkdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ASSETS = '/Users/aashumotlani/.cursor/projects/Users-aashumotlani-awesomepg/assets';

const APG_MASTER = join(ASSETS, 'apg-icon-master-1024.png');
const CAPITAL_MASTER = join(ASSETS, 'capital-icon-master-1024.png');

const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];

async function writePng(src, dest, size) {
  mkdirSync(dirname(dest), { recursive: true });
  await sharp(src)
    .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(dest);
  console.log('wrote', dest.replace(ROOT + '/', ''), `${size}x${size}`);
}

async function writeIcoFromPng(src, dest, size = 32) {
  // Browsers accept PNG bytes in .ico; keep naming for existing metadata paths.
  await sharp(src)
    .resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .png()
    .toFile(dest);
  console.log('wrote', dest.replace(ROOT + '/', ''), `ico/${size}`);
}

async function main() {
  // Masters into public brand folders
  mkdirSync(join(ROOT, 'public/icons'), { recursive: true });
  mkdirSync(join(ROOT, 'public/capital/icons'), { recursive: true });
  mkdirSync(join(ROOT, 'public/brand'), { recursive: true });

  copyFileSync(APG_MASTER, join(ROOT, 'public/brand/awesome-pg-1024.png'));
  copyFileSync(CAPITAL_MASTER, join(ROOT, 'public/brand/automotive-capital-1024.png'));
  copyFileSync(APG_MASTER, join(ROOT, 'public/icons/apg-icon-1024.png'));
  copyFileSync(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/icon-1024.png'));

  // Awesome PG sizes used by app
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-favicon-16.png'), 16);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-favicon-32.png'), 32);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-favicon-48.png'), 48);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-icon-64.png'), 64);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-icon-128.png'), 128);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-apple-touch.png'), 180);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-admin-192.png'), 192);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-icon-256.png'), 256);
  await writePng(APG_MASTER, join(ROOT, 'public/icons/apg-admin-512.png'), 512);
  await writePng(APG_MASTER, join(ROOT, 'public/og/awesome-pg.png'), 512);

  // Root Next favicon
  await writeIcoFromPng(APG_MASTER, join(ROOT, 'app/favicon.ico'), 32);

  // Capital sizes
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/favicon-16.png'), 16);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/favicon-32.png'), 32);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/icon-48.png'), 48);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/icon-64.png'), 64);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/icon-128.png'), 128);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/apple-touch.png'), 180);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/icon-192.png'), 192);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/icon-256.png'), 256);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/icon-512.png'), 512);
  await writeIcoFromPng(CAPITAL_MASTER, join(ROOT, 'public/capital/icons/favicon.ico'), 32);
  await writePng(CAPITAL_MASTER, join(ROOT, 'public/og/automotive-capital.png'), 512);

  // Also dump full size set for both under brand/
  for (const size of SIZES) {
    await writePng(APG_MASTER, join(ROOT, `public/brand/awesome-pg-${size}.png`), size);
    await writePng(CAPITAL_MASTER, join(ROOT, `public/brand/automotive-capital-${size}.png`), size);
  }

  console.log('✓ Brand icons exported');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
