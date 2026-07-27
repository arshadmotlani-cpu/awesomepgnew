const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

const attempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= MAX_ATTEMPTS) return { allowed: false };
  entry.count += 1;
  return { allowed: true };
}

export function resetLoginRateLimit(ip: string): void {
  attempts.delete(ip);
}
