import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isCloudinaryConfigured, uploadBufferToCloudinary } from '@/src/lib/images/cloudinary';
import { logger } from '@/src/lib/logger';
import { KycStorageError } from '@/src/lib/kyc/errors';

const KYC_ROOT = path.join(process.cwd(), 'data', 'kyc');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export type KycFileKind = 'aadhaar_front' | 'aadhaar_back' | 'selfie';

export type KycStoredFile = {
  /** Value stored in kyc_submissions.*_path — HTTPS URL or relative filesystem path. */
  storagePath: string;
  fileUrl: string | null;
  mime: string;
  backend: 'cloudinary' | 'filesystem';
  bytes: number;
};

export function assertKycMimeType(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function assertKycFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_BYTES;
}

export function kycStorageRoot(): string {
  return KYC_ROOT;
}

export type KycStorageBackend = 'cloudinary' | 'filesystem';

/** Production (Vercel) requires Cloudinary — never store binary blobs in Postgres. */
export function resolveKycStorageBackend(): KycStorageBackend {
  if (process.env.KYC_STORAGE === 'filesystem') return 'filesystem';
  if (isCloudinaryConfigured()) return 'cloudinary';
  if (process.env.VERCEL === '1') {
    throw new KycStorageError(
      'NOT_CONFIGURED',
      'KYC storage is not configured for production (Cloudinary env vars missing).',
    );
  }
  return 'filesystem';
}

function mimeToExt(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function normalizeMime(mime: string): string {
  const trimmed = mime.trim().toLowerCase();
  if (trimmed === 'image/jpg') return 'image/jpeg';
  return trimmed || 'image/jpeg';
}

/**
 * Upload a validated KYC image to external storage, then persist only metadata in Postgres.
 * Must run before inserting the parent kyc_submissions row.
 */
export async function storeKycFile(args: {
  customerId: string;
  submissionId: string;
  kind: KycFileKind;
  buffer: Buffer;
  mime: string;
}): Promise<KycStoredFile> {
  const mime = normalizeMime(args.mime);
  const bytes = args.buffer.length;

  logger.info('KYC store start', {
    kind: args.kind,
    submissionId: args.submissionId,
    customerId: args.customerId,
    mime,
    bytes,
  });

  if (!assertKycMimeType(mime)) {
    throw new KycStorageError('UPLOAD_FAILED', `Unsupported mime type: ${mime}`);
  }
  if (!assertKycFileSize(bytes)) {
    throw new KycStorageError('UPLOAD_FAILED', 'Image exceeds 8 MB after processing.');
  }

  const backend = resolveKycStorageBackend();

  try {
    if (backend === 'cloudinary') {
      const folder = `awesomepg/kyc/${args.customerId}/${args.submissionId}`;
      const uploaded = await uploadBufferToCloudinary(args.buffer, mime, {
        folder,
        publicId: args.kind,
      });

      const stored: KycStoredFile = {
        storagePath: uploaded.secureUrl,
        fileUrl: uploaded.secureUrl,
        mime,
        backend: 'cloudinary',
        bytes,
      };

      logger.info('KYC store cloudinary ok', {
        kind: args.kind,
        submissionId: args.submissionId,
        mime,
        bytes,
        publicId: uploaded.publicId,
      });

      return stored;
    }

    const dir = path.join(KYC_ROOT, args.customerId, args.submissionId);
    await mkdir(dir, { recursive: true });
    const ext = mimeToExt(mime);
    const filename = `${args.kind}.${ext}`;
    const fullPath = path.join(dir, filename);
    await writeFile(fullPath, args.buffer);
    const relativePath = path.relative(KYC_ROOT, fullPath);

    const stored: KycStoredFile = {
      storagePath: relativePath,
      fileUrl: null,
      mime,
      backend: 'filesystem',
      bytes,
    };

    logger.info('KYC store filesystem ok', {
      kind: args.kind,
      submissionId: args.submissionId,
      mime,
      bytes,
      storagePath: relativePath,
    });

    return stored;
  } catch (err) {
    logger.error('KYC store failed', {
      kind: args.kind,
      submissionId: args.submissionId,
      mime,
      bytes,
      backend,
      error: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof KycStorageError) throw err;
    throw new KycStorageError('UPLOAD_FAILED', 'KYC file upload failed.', err);
  }
}

/** @deprecated Use storeKycFile — kept for scripts/tests. */
export async function saveKycFile(args: {
  customerId: string;
  submissionId: string;
  kind: KycFileKind;
  buffer: Buffer;
  mime: string;
}): Promise<string> {
  const stored = await storeKycFile(args);
  return stored.storagePath;
}

export function isRemoteKycUrl(storedPath: string): boolean {
  const trimmed = storedPath.trim();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

export async function resolveKycDocumentResponse(
  storedPath: string,
  mimeHint?: string | null,
): Promise<Response> {
  if (isRemoteKycUrl(storedPath)) {
    return Response.redirect(storedPath, 302);
  }

  const { buffer, mime } = await readKycFileBytes(storedPath, mimeHint);
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, no-store',
    },
  });
}

export function resolveKycFilePath(relativePath: string): string {
  if (isRemoteKycUrl(relativePath)) {
    throw new Error('Remote KYC URLs must be served via redirect.');
  }
  const resolved = path.resolve(KYC_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(KYC_ROOT))) {
    throw new Error('Invalid KYC document path.');
  }
  return resolved;
}

export async function readKycFileBytes(
  storedPath: string,
  mimeHint?: string | null,
): Promise<{ buffer: Buffer; mime: string }> {
  if (isRemoteKycUrl(storedPath)) {
    throw new KycStorageError('READ_FAILED', 'Use resolveKycDocumentResponse for remote URLs.');
  }

  try {
    const absolutePath = resolveKycFilePath(storedPath);
    const buffer = await readFile(absolutePath);
    if (mimeHint) return { buffer, mime: mimeHint };
    const ext = path.extname(absolutePath).slice(1).toLowerCase();
    const mime =
      ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return { buffer, mime };
  } catch (err) {
    logger.error('KYC read failed', {
      storagePath: storedPath,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new KycStorageError('READ_FAILED', 'KYC file missing.', err);
  }
}
