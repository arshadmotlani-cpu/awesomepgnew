import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { webhookReplayGuard } from '@/src/db/schema/webhookReplayGuard';

const SIGNATURE_HEADER = 'x-mock-webhook-signature';
const TIMESTAMP_HEADER = 'x-mock-webhook-timestamp';
const MAX_AGE_MS = 5 * 60 * 1000;

export function isProductionDeployment(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production'
  );
}

/** Mock webhooks are disabled in every production deployment. */
export function isMockWebhookRouteEnabled(): boolean {
  return !isProductionDeployment();
}

export function mockWebhookSecret(): string | null {
  const v = process.env.MOCK_WEBHOOK_SECRET?.trim();
  return v && v.length >= 16 ? v : null;
}

export function signMockWebhookPayload(rawBody: string, timestampMs?: number): {
  signature: string;
  timestamp: string;
  headers: Record<string, string>;
} {
  const secret = mockWebhookSecret();
  if (!secret) {
    throw new Error('MOCK_WEBHOOK_SECRET is not configured.');
  }
  const timestamp = String(timestampMs ?? Date.now());
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return {
    signature,
    timestamp,
    headers: {
      'content-type': 'application/json',
      [SIGNATURE_HEADER]: signature,
      [TIMESTAMP_HEADER]: timestamp,
    },
  };
}

function digestSignature(signature: string): string {
  return createHmac('sha256', 'mock-webhook-replay-digest')
    .update(signature)
    .digest('hex');
}

export type MockWebhookAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; reason: string };

export async function verifyMockWebhookRequest(
  rawBody: string,
  headers: Headers,
): Promise<MockWebhookAuthResult> {
  if (!isMockWebhookRouteEnabled()) {
    return { ok: false, status: 403, reason: 'mock webhook disabled in production' };
  }

  const secret = mockWebhookSecret();
  if (!secret) {
    return { ok: false, status: 403, reason: 'MOCK_WEBHOOK_SECRET is not configured' };
  }

  const signature = headers.get(SIGNATURE_HEADER)?.trim();
  const timestampRaw = headers.get(TIMESTAMP_HEADER)?.trim();
  if (!signature || !timestampRaw) {
    return { ok: false, status: 401, reason: 'missing mock webhook signature headers' };
  }

  const timestampMs = Number(timestampRaw);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false, status: 401, reason: 'invalid mock webhook timestamp' };
  }
  const age = Math.abs(Date.now() - timestampMs);
  if (age > MAX_AGE_MS) {
    return { ok: false, status: 401, reason: 'mock webhook timestamp expired' };
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestampRaw}.${rawBody}`)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, status: 401, reason: 'invalid mock webhook signature' };
  }

  const replayKey = digestSignature(signature);
  try {
    await db.insert(webhookReplayGuard).values({
      webhookKind: 'mock',
      signatureDigest: replayKey,
    });
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    if (code === '23505') {
      return { ok: false, status: 401, reason: 'replay detected' };
    }
    throw err;
  }

  // Prune old replay rows (best-effort).
  void db
    .execute(
      sql`DELETE FROM webhook_replay_guard WHERE created_at < now() - interval '1 day'`,
    )
    .catch(() => undefined);

  return { ok: true };
}

export { SIGNATURE_HEADER, TIMESTAMP_HEADER };
