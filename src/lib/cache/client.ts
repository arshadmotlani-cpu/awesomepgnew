import { Redis } from '@upstash/redis';

let redisClient: Redis | null | undefined;

/**
 * Optional Upstash Redis — returns null when not configured or on the client.
 * The app must behave identically without Redis (direct DB reads).
 */
export function getRedisClient(): Redis | null {
  if (typeof window !== 'undefined') return null;
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    redisClient = null;
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}
