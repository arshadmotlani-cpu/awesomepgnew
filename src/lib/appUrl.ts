/** Canonical public base URL for email links and callbacks. */
export function getAppBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.WATCHDOG_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return 'http://localhost:3000';
}

/** Mask an email for display, e.g. `ops@awesomepg.in` → `o**@awesomepg.in`. */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '•••';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if (local.length <= 1) return `•@${domain}`;
  return `${local[0]}${'•'.repeat(Math.min(local.length - 1, 3))}@${domain}`;
}
