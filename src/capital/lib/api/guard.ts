import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getCapitalSession } from '@/src/capital/lib/auth/session';
import { isCapitalHostFromHeaders } from '@/src/capital/lib/host';

export async function requireCapitalApiAuth() {
  const hdrs = await headers();
  if (!isCapitalHostFromHeaders(hdrs) && hdrs.get('x-capital-app') !== '1') {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  const session = await getCapitalSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { session };
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_DOCUMENT_BYTES) {
    return 'File must be 10 MB or smaller.';
  }
  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mime) && !mime.startsWith('image/')) {
    return 'File type is not allowed.';
  }
  return null;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document';
  return base.replace(/[^\w.\-]/g, '_').slice(0, 200) || 'document';
}
