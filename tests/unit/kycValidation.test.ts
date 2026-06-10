import sharp from 'sharp';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectAadhaarOcrSignals,
  validateKycImage,
} from '../../src/services/kycValidation';

async function makeAadhaarLikeJpeg(): Promise<Buffer> {
  const svg = `
    <svg width="640" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#e8e0d0"/>
      <text x="20" y="40" font-size="28" fill="#111">GOVERNMENT OF INDIA</text>
      <text x="20" y="80" font-size="24" fill="#111">UIDAI</text>
      <text x="20" y="120" font-size="20" fill="#111">1234 5678 9012</text>
      ${Array.from({ length: 40 }, (_, i) => `<rect x="${(i % 10) * 60}" y="${160 + Math.floor(i / 10) * 20}" width="50" height="8" fill="#333"/>`).join('')}
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function makeSelfieJpeg(): Promise<Buffer> {
  const svg = `
    <svg width="800" height="800" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#c4b5a0"/>
      <ellipse cx="400" cy="320" rx="160" ry="200" fill="#8b7355"/>
      ${Array.from({ length: 120 }, (_, i) => `<rect x="${(i % 12) * 60}" y="${400 + Math.floor(i / 12) * 18}" width="55" height="10" fill="#${(i % 9) + 1}${(i % 9) + 1}${(i % 9) + 1}"/>`).join('')}
      ${Array.from({ length: 80 }, (_, i) => `<circle cx="${40 + i * 9}" cy="${40 + (i % 8) * 12}" r="5" fill="#222"/>`).join('')}
    </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer();
}

describe('detectAadhaarOcrSignals', () => {
  it('finds UIDAI keywords in embedded ASCII', () => {
    const buf = Buffer.alloc(20_000, 0);
    buf.write('UIDAI GOVERNMENT OF INDIA AADHAAR 1234 5678 9012', 500);
    const signals = detectAadhaarOcrSignals(buf);
    assert.ok(signals.length > 0);
  });
});

describe('validateKycImage', () => {
  it('rejects tiny blank buffer', async () => {
    const result = await validateKycImage(Buffer.alloc(100), 'aadhaar_front');
    assert.equal(result.ok, false);
  });

  it('accepts synthetic aadhaar front', async () => {
    const buf = await makeAadhaarLikeJpeg();
    const result = await validateKycImage(buf, 'aadhaar_front');
    assert.equal(result.ok, true);
  });

  it('accepts synthetic selfie without OCR', async () => {
    const buf = await makeSelfieJpeg();
    const result = await validateKycImage(buf, 'selfie');
    assert.equal(result.ok, true);
  });
});
