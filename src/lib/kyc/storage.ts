import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KYC_ROOT = path.join(process.cwd(), 'data', 'kyc');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export function assertKycMimeType(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function assertKycFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_BYTES;
}

export function kycStorageRoot(): string {
  return KYC_ROOT;
}

export async function saveKycFile(args: {
  customerId: string;
  submissionId: string;
  kind: 'aadhaar_front' | 'aadhaar_back' | 'selfie';
  buffer: Buffer;
  mime: string;
}): Promise<string> {
  const ext =
    args.mime === 'image/png' ? 'png' : args.mime === 'image/webp' ? 'webp' : 'jpg';
  const dir = path.join(KYC_ROOT, args.customerId, args.submissionId);
  await mkdir(dir, { recursive: true });
  const filename = `${args.kind}.${ext}`;
  const fullPath = path.join(dir, filename);
  await writeFile(fullPath, args.buffer);
  return path.relative(KYC_ROOT, fullPath);
}

export function resolveKycFilePath(relativePath: string): string {
  const resolved = path.resolve(KYC_ROOT, relativePath);
  if (!resolved.startsWith(path.resolve(KYC_ROOT))) {
    throw new Error('Invalid KYC document path.');
  }
  return resolved;
}
