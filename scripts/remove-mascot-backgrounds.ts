/**
 * Strip flat black backdrops from Roachie PNGs → true alpha transparency.
 *
 *   npx tsx scripts/remove-mascot-backgrounds.ts
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ASSETS_DIR = join(process.cwd(), 'public/assets');

function alphaForRgb(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  if (max <= 28) return 0;
  if (max <= 72) return Math.round(((max - 28) / 44) * 255);
  return 255;
}

async function processFile(name: string) {
  const filePath = join(ASSETS_DIR, name);
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i]!;
    const g = out[i + 1]!;
    const b = out[i + 2]!;
    out[i + 3] = alphaForRgb(r, g, b);
  }

  await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(filePath);

  console.log(`✓ ${name} (${info.width}×${info.height})`);
}

async function main() {
  const files = readdirSync(ASSETS_DIR).filter((f) => f.startsWith('cockroach-') && f.endsWith('.png'));
  if (files.length === 0) {
    console.error('No cockroach-*.png files in public/assets');
    process.exit(1);
  }
  for (const file of files) {
    await processFile(file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
