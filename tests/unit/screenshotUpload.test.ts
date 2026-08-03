import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  compressPaymentProofImage,
  formatProofImageProcessingError,
  PROOF_IMAGE_ERRORS,
  sanitizePaymentUploadError,
} from '../../src/lib/payments/proofImageProcessing';
import {
  isPaymentScreenshotUploadAvailable,
  uploadPaymentScreenshot,
} from '../../src/lib/payments/screenshotUpload';

function fileFromBuffer(buffer: Buffer, name: string, type: string): File {
  return new File([buffer], name, { type });
}

/** Minimal valid JPEG SOI + JFIF marker only — libvips reports premature end. */
function truncatedJpegBuffer(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
  ]);
}

async function validJpegBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 400, height: 300, channels: 3, background: { r: 40, g: 120, b: 200 } },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function validPngBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 360, height: 640, channels: 3, background: { r: 255, g: 90, b: 30 } },
  })
    .png()
    .toBuffer();
}

/** Simulates a partially downloaded / WhatsApp-forwarded corrupt JPEG. */
async function halfTruncatedRealJpeg(): Promise<Buffer> {
  const full = await validJpegBuffer();
  return full.subarray(0, Math.max(40, Math.floor(full.length * 0.15)));
}

function assertNoInternalLibraryLeak(message: string) {
  assert.doesNotMatch(message, /vips/i);
  assert.doesNotMatch(message, /libvips/i);
  assert.doesNotMatch(message, /sharp/i);
  assert.doesNotMatch(message, /mozjpeg/i);
  assert.doesNotMatch(message, /premature end/i);
}

test('formatProofImageProcessingError maps VipsJpeg premature end to friendly copy', () => {
  const friendly = formatProofImageProcessingError(
    new Error('Input buffer has corrupt header: VipsJpeg: premature end of JPEG image'),
  );
  assert.equal(friendly, PROOF_IMAGE_ERRORS.corrupt);
  assertNoInternalLibraryLeak(friendly);
});

test('sanitizePaymentUploadError never exposes libvips internals from upload wrapper', () => {
  const friendly = sanitizePaymentUploadError(
    new Error('Input buffer has corrupt header: VipsJpeg: premature end of JPEG image'),
  );
  assert.equal(friendly, PROOF_IMAGE_ERRORS.corrupt);
  assertNoInternalLibraryLeak(friendly);
});

test('compressPaymentProofImage rejects truncated JPEG without leaking VipsJpeg', async () => {
  const file = fileFromBuffer(truncatedJpegBuffer(), 'whatsapp-forward.jpg', 'image/jpeg');
  await assert.rejects(
    () => compressPaymentProofImage(file),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, PROOF_IMAGE_ERRORS.corrupt);
      assertNoInternalLibraryLeak(err.message);
      return true;
    },
  );
});

test('compressPaymentProofImage rejects half-truncated real JPEG', async () => {
  const buf = await halfTruncatedRealJpeg();
  const file = fileFromBuffer(buf, 'google-photos-partial.jpg', 'image/jpeg');
  await assert.rejects(
    () => compressPaymentProofImage(file),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assertNoInternalLibraryLeak(err.message);
      return true;
    },
  );
});

test('compressPaymentProofImage rejects empty file', async () => {
  const file = fileFromBuffer(Buffer.alloc(0), 'empty.jpg', 'image/jpeg');
  await assert.rejects(
    () => compressPaymentProofImage(file),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, PROOF_IMAGE_ERRORS.empty);
      return true;
    },
  );
});

test('compressPaymentProofImage accepts valid JPEG (Android-style screenshot dimensions)', async () => {
  const buf = await validJpegBuffer();
  const file = fileFromBuffer(buf, 'screenshot.jpg', 'image/jpeg');
  const { buffer, mime } = await compressPaymentProofImage(file);
  assert.equal(mime, 'image/jpeg');
  assert.ok(buffer.length > 100);
  assert.ok(buffer[0] === 0xff && buffer[1] === 0xd8);
});

test('compressPaymentProofImage accepts valid PNG (iPhone screenshot-style)', async () => {
  const buf = await validPngBuffer();
  const file = fileFromBuffer(buf, 'IMG_1234.PNG', 'image/png');
  const { buffer, mime } = await compressPaymentProofImage(file);
  assert.equal(mime, 'image/jpeg');
  assert.ok(buffer.length > 100);
});

test('uploadPaymentScreenshot returns data URL for valid PNG in local dev', async () => {
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;

  try {
    const buf = await validPngBuffer();
    const file = fileFromBuffer(buf, 'payment.png', 'image/png');
    const url = await uploadPaymentScreenshot(file);
    assert.match(url, /^data:image\/jpeg;base64,/);
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});

test('uploadPaymentScreenshot surfaces friendly error for corrupt JPEG', async () => {
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;

  try {
    const file = fileFromBuffer(truncatedJpegBuffer(), 'broken.jpg', 'image/jpeg');
    await assert.rejects(
      () => uploadPaymentScreenshot(file),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, PROOF_IMAGE_ERRORS.corrupt);
        assertNoInternalLibraryLeak(err.message);
        return true;
      },
    );
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});

test('compressPaymentProofImage rejects random garbage bytes', async () => {
  const file = fileFromBuffer(Buffer.from('not an image at all'), 'fake.jpg', 'image/jpeg');
  await assert.rejects(
    () => compressPaymentProofImage(file),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assertNoInternalLibraryLeak(err.message);
      return true;
    },
  );
});

test('payment screenshot upload is available in local dev without Blob', () => {
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.equal(isPaymentScreenshotUploadAvailable(), true);
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});

test('payment screenshot upload is blocked on Vercel without Blob', () => {
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.VERCEL = '1';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.equal(isPaymentScreenshotUploadAvailable(), false);
  } finally {
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  }
});
