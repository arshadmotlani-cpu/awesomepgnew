/**
 * Safe post-login destination for platform routes.
 * Only same-origin /platform paths are allowed.
 */
export function safePlatformNext(next: string | null | undefined): string {
  const raw = String(next ?? '').trim();
  if (raw.startsWith('/platform') && !raw.startsWith('//') && !raw.includes('\\')) {
    return raw;
  }
  return '/platform/dashboard';
}
