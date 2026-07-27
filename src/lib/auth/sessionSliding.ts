/** Shared sliding-session decision (PG, Capital, Hair). */

export function shouldSlideSessionExpiry(args: {
  expiresAt: Date;
  lastSeenAt: Date;
  /** Also slide when remaining lifetime is at or below this (ms). */
  refreshThresholdMs: number;
  /** Min time since lastSeenAt before extending again (ms). */
  refreshMinIntervalMs: number;
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();
  const remaining = args.expiresAt.getTime() - now.getTime();
  if (remaining <= args.refreshThresholdMs) {
    return true;
  }
  const sinceLastSlide = now.getTime() - args.lastSeenAt.getTime();
  return sinceLastSlide >= args.refreshMinIntervalMs;
}

export function sessionExpiryFromNow(sessionMs: number, now = new Date()): Date {
  return new Date(now.getTime() + sessionMs);
}
