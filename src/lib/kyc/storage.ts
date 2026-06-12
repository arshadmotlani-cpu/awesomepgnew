import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { kycSubmissionFiles } from '@/src/db/schema';

const KYC_ROOT = path.join(process.cwd(), 'data', 'kyc');
const DB_PATH_PREFIX = 'db:';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export type KycFileKind = 'aadhaar_front' | 'aadhaar_back' | 'selfie';

export function assertKycMimeType(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function assertKycFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_BYTES;
}

export function kycStorageRoot(): string {
  return KYC_ROOT;
}

/** Serverless (Vercel) has a read-only filesystem — store blobs in Postgres instead. */
export function useKycDatabaseStorage(): boolean {
  if (process.env.KYC_STORAGE === 'filesystem') return false;
  if (process.env.KYC_STORAGE === 'database') return true;
  return process.env.VERCEL === '1';
}

function mimeToExt(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function dbStoragePath(submissionId: string, kind: KycFileKind, ext: string): string {
  return `${DB_PATH_PREFIX}${submissionId}/${kind}.${ext}`;
}

function parseDbStoragePath(relativePath: string): { submissionId: string; kind: KycFileKind } | null {
  if (!relativePath.startsWith(DB_PATH_PREFIX)) return null;
  const rest = relativePath.slice(DB_PATH_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const submissionId = rest.slice(0, slash);
  const filename = rest.slice(slash + 1);
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return null;
  const kind = filename.slice(0, dot) as KycFileKind;
  if (kind !== 'aadhaar_front' && kind !== 'aadhaar_back' && kind !== 'selfie') return null;
  return { submissionId, kind };
}

export async function saveKycFile(args: {
  customerId: string;
  submissionId: string;
  kind: KycFileKind;
  buffer: Buffer;
  mime: string;
}): Promise<string> {
  const ext = mimeToExt(args.mime);

  if (useKycDatabaseStorage()) {
    await db
      .insert(kycSubmissionFiles)
      .values({
        submissionId: args.submissionId,
        kind: args.kind,
        mime: args.mime,
        content: args.buffer,
      })
      .onConflictDoUpdate({
        target: [kycSubmissionFiles.submissionId, kycSubmissionFiles.kind],
        set: {
          mime: args.mime,
          content: args.buffer,
        },
      });
    return dbStoragePath(args.submissionId, args.kind, ext);
  }

  const dir = path.join(KYC_ROOT, args.customerId, args.submissionId);
  await mkdir(dir, { recursive: true });
  const filename = `${args.kind}.${ext}`;
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, args.buffer);
  return path.relative(KYC_ROOT, fullPath);
}

export function resolveKycFilePath(relativePath: string): string {
  if (relativePath.startsWith(DB_PATH_PREFIX)) {
    throw new Error('Database-backed KYC files must be read via readKycFileBytes().');
  }
  const resolved = path.resolve(KYC_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(KYC_ROOT))) {
    throw new Error('Invalid KYC document path.');
  }
  return resolved;
}

export async function readKycFileBytes(relativePath: string): Promise<{ buffer: Buffer; mime: string }> {
  const dbRef = parseDbStoragePath(relativePath);
  if (dbRef) {
    const [row] = await db
      .select({
        mime: kycSubmissionFiles.mime,
        content: kycSubmissionFiles.content,
      })
      .from(kycSubmissionFiles)
      .where(
        and(
          eq(kycSubmissionFiles.submissionId, dbRef.submissionId),
          eq(kycSubmissionFiles.kind, dbRef.kind),
        ),
      )
      .limit(1);
    if (!row) {
      throw new Error('KYC file not found in database.');
    }
    return { buffer: row.content, mime: row.mime };
  }

  const absolutePath = resolveKycFilePath(relativePath);
  const buffer = await readFile(absolutePath);
  const ext = path.extname(absolutePath).slice(1).toLowerCase();
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { buffer, mime };
}
