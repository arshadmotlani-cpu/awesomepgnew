/** Edge middleware — Web Crypto HMAC verify for platform session cookies. */

function sessionSecret(): string {
  return (
    process.env.AUTH_SECRET?.trim() ||
    process.env.PLATFORM_SESSION_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    'dev-platform-session-secret-change-me'
  );
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function verifySigned(value: string): Promise<string | null> {
  const idx = value.lastIndexOf('.');
  if (idx <= 0) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expectedB64 = bytesToBase64Url(new Uint8Array(expected));
  if (sig.length !== expectedB64.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedB64.charCodeAt(i);
  if (diff !== 0) return null;
  return payload;
}

export type PlatformSessionCookiePayload = {
  userId: string;
  exp: number;
};

export async function readPlatformSessionCookiePayloadEdge(
  raw: string | undefined,
): Promise<PlatformSessionCookiePayload | null> {
  if (!raw) return null;
  const payload = await verifySigned(raw);
  if (!payload) return null;

  try {
    const json = new TextDecoder().decode(base64UrlToBytes(payload));
    const parsed = JSON.parse(json) as { userId?: string; exp?: number };
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) return null;
    return { userId: parsed.userId, exp: parsed.exp };
  } catch {
    return null;
  }
}
