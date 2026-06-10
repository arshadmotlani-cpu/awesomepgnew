/* eslint-disable no-console */
/**
 * Simulates client KYC compression with sharp (5–8 MB camera-style JPEGs).
 */
import sharp from 'sharp';
import {
  KYC_AADHAAR_MAX_EDGE_PX,
  KYC_TARGET_BYTES,
  validateKycUploadSize,
} from '../src/lib/kyc/uploadLimits';

async function makeLargeAadhaarJpeg(targetBytes: number): Promise<Buffer> {
  const svg = `
    <svg width="4032" height="3024" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#e8e0d0"/>
      <text x="80" y="200" font-size="120" fill="#111">GOVERNMENT OF INDIA</text>
      <text x="80" y="360" font-size="96" fill="#111">UIDAI · AADHAAR</text>
      <text x="80" y="520" font-size="80" fill="#111">1234 5678 9012</text>
      ${Array.from({ length: 200 }, (_, i) => `<rect x="${(i % 20) * 180}" y="${600 + Math.floor(i / 20) * 40}" width="160" height="20" fill="#333"/>`).join('')}
    </svg>`;

  let quality = 98;
  let buf = await sharp(Buffer.from(svg)).jpeg({ quality }).toBuffer();
  while (buf.length < targetBytes && quality < 100) {
    quality += 1;
    buf = await sharp(Buffer.from(svg)).jpeg({ quality }).toBuffer();
  }
  return buf;
}

async function compressLikeClient(input: Buffer): Promise<Buffer> {
  const resize = () =>
    sharp(input)
      .rotate()
      .resize({
        width: KYC_AADHAAR_MAX_EDGE_PX,
        height: KYC_AADHAAR_MAX_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' });

  let quality = 90;
  let out = await resize().jpeg({ quality }).toBuffer();
  while (out.length > KYC_TARGET_BYTES && quality > 52) {
    quality -= 6;
    out = await resize().jpeg({ quality }).toBuffer();
  }
  return out;
}

function mb(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  console.log('\n=== KYC compression verification (sharp simulation) ===\n');

  for (const targetMb of [5, 6, 8]) {
    const raw = await makeLargeAadhaarJpeg(targetMb * 1024 * 1024);
    const sizeErr = validateKycUploadSize(raw.length);
    const compressed = await compressLikeClient(raw);
    const ok =
      !sizeErr &&
      compressed.length <= KYC_TARGET_BYTES &&
      validateKycUploadSize(compressed.length) === null;

    console.log(
      `${ok ? '✓' : '✗'} ${targetMb} MB source → ${mb(raw.length)} → ${mb(compressed.length)}`,
    );
    if (!ok) process.exitCode = 1;
  }

  const over = validateKycUploadSize(11 * 1024 * 1024);
  if (over !== 'Image is too large. Please upload a file smaller than 10 MB.') {
    console.error('✗ 11 MB rejection message incorrect:', over);
    process.exitCode = 1;
  } else {
    console.log('✓ 11 MB rejected with friendly message');
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
