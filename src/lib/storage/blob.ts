import { del, get, head, put } from '@vercel/blob';

export const BLOB_PRIVATE_ENV_VARS = ['BLOB_READ_WRITE_TOKEN'] as const;
export const BLOB_PUBLIC_ENV_VARS = ['BLOB_PUBLIC_READ_WRITE_TOKEN'] as const;

export type BlobUploadBody = Buffer | File | Blob | ReadableStream | string;

export type BlobStoredFile = {
  url: string;
  pathname: string;
  contentType?: string;
};

function privateToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim();
}

function publicToken(): string | undefined {
  return process.env.BLOB_PUBLIC_READ_WRITE_TOKEN?.trim() || privateToken();
}

export function isBlobPrivateConfigured(): boolean {
  return Boolean(privateToken());
}

export function isBlobPublicConfigured(): boolean {
  return Boolean(publicToken());
}

/** @deprecated Prefer isBlobPrivateConfigured — kept for health summaries. */
export function isBlobConfigured(): boolean {
  return isBlobPrivateConfigured();
}

export function isBlobUrl(stored: string): boolean {
  return /\.blob\.vercel-storage\.com\//.test(stored.trim());
}

export function isPrivateBlobUrl(stored: string): boolean {
  return /\.private\.blob\.vercel-storage\.com\//.test(stored.trim());
}

function assertPrivateConfigured(): void {
  if (!isBlobPrivateConfigured()) {
    throw new Error(
      'Blob private storage is not configured. Create a private Blob store in Vercel and set BLOB_READ_WRITE_TOKEN.',
    );
  }
}

function assertPublicConfigured(): void {
  if (!isBlobPublicConfigured()) {
    throw new Error(
      'Blob public storage is not configured. Create a public Blob store in Vercel and set BLOB_PUBLIC_READ_WRITE_TOKEN.',
    );
  }
}

export async function uploadPrivate(
  pathname: string,
  body: BlobUploadBody,
  contentType?: string,
): Promise<BlobStoredFile> {
  assertPrivateConfigured();
  const result = await put(pathname, body, {
    access: 'private',
    token: privateToken(),
    contentType,
    addRandomSuffix: false,
  });
  return { url: result.url, pathname: result.pathname, contentType: result.contentType };
}

export async function uploadPublic(
  pathname: string,
  body: BlobUploadBody,
  contentType?: string,
): Promise<BlobStoredFile> {
  assertPublicConfigured();
  const result = await put(pathname, body, {
    access: 'public',
    token: publicToken(),
    contentType,
    addRandomSuffix: false,
  });
  return { url: result.url, pathname: result.pathname, contentType: result.contentType };
}

export async function uploadPublicFile(file: File, pathnamePrefix: string): Promise<string> {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const pathname = `${pathnamePrefix}/${Date.now()}${ext}`;
  const stored = await uploadPublic(pathname, file, file.type || undefined);
  return stored.url;
}

export async function getPrivate(urlOrPathname: string): Promise<{
  stream: ReadableStream;
  contentType: string;
}> {
  assertPrivateConfigured();
  const result = await get(urlOrPathname, {
    access: 'private',
    token: privateToken(),
  });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error('Blob file not found.');
  }
  return {
    stream: result.stream,
    contentType: result.blob.contentType ?? 'application/octet-stream',
  };
}

export async function deleteBlob(urlOrPathname: string, access: 'private' | 'public'): Promise<void> {
  const token = access === 'private' ? privateToken() : publicToken();
  if (!token) throw new Error('Blob storage is not configured.');
  await del(urlOrPathname, { token });
}

/** Future room images — pathname helper only (no schema yet). */
export function roomImageBlobPath(roomId: string, filename: string): string {
  return `rooms/${roomId}/${filename}`;
}

/** Non-throwing HEAD check — true when the private blob object exists and is readable. */
export async function privateBlobReachable(urlOrPathname: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const trimmed = urlOrPathname.trim();
  if (!trimmed) return { ok: false, reason: 'Empty storage path' };
  if (!isPrivateBlobUrl(trimmed)) {
    return { ok: false, reason: 'Not a private Blob URL' };
  }
  if (!isBlobPrivateConfigured()) {
    return { ok: false, reason: 'Private Blob storage is not configured' };
  }
  try {
    await head(trimmed, { token: privateToken() });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    if (name === 'BlobNotFoundError' || /not found|404/i.test(msg)) {
      return { ok: false, reason: 'Blob object not found (404)' };
    }
    if (/403|forbidden|unauthorized/i.test(msg)) {
      return { ok: false, reason: 'Blob access denied (403)' };
    }
    return { ok: false, reason: msg.slice(0, 200) };
  }
}

/** Non-throwing connectivity probe for health checks. */
export async function checkBlobConnectivity(): Promise<{ ok: boolean; detail: string }> {
  if (!isBlobPrivateConfigured()) {
    return { ok: false, detail: 'BLOB_READ_WRITE_TOKEN not set' };
  }
  try {
    await head('__health_check__', {
      token: privateToken(),
    });
    return { ok: true, detail: 'Private Blob store reachable' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : '';
    if (name === 'BlobNotFoundError' || /not found|404/i.test(msg)) {
      return { ok: true, detail: 'Private Blob store reachable' };
    }
    return { ok: false, detail: msg.slice(0, 200) };
  }
}
