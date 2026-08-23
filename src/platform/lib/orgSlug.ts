/**
 * Derive platform.organizations.slug from a human salon name.
 * Phase F resolves `{slug}.fyhair.app` via this column — display name stays separate.
 */

/** Labels that must never be tenant subdomains (host parse + allocation). */
export const RESERVED_ORG_SLUGS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'platform',
  'mail',
  'status',
  'cdn',
  'static',
  'fyhair',
  'foryourhair',
  'staging',
  'subscribe',
]);

const MAX_SLUG_LEN = 63;

/** Lowercase, spaces→hyphens, strip non-alnum; truncate to DNS label length. */
export function slugifySalonName(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LEN)
    .replace(/^-+|-+$/g, '');
  return base;
}

export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_ORG_SLUGS.has(slug.trim().toLowerCase());
}

export function isValidOrgSlugShape(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

/**
 * Pick a unique, host-safe slug for a salon name.
 * Never rejects the display name — collisions / reserved words get a numeric suffix.
 */
export async function allocateUniqueOrgSlug(input: {
  salonName: string;
  isTaken: (slug: string) => Promise<boolean>;
}): Promise<string> {
  let base = slugifySalonName(input.salonName);
  if (!base || !isValidOrgSlugShape(base) || isReservedOrgSlug(base)) {
    base = 'salon';
  }

  if (!(await input.isTaken(base)) && !isReservedOrgSlug(base)) {
    return base;
  }

  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const truncated = base.slice(0, Math.max(1, MAX_SLUG_LEN - suffix.length)).replace(/-+$/g, '');
    const candidate = `${truncated}${suffix}`;
    if (!isValidOrgSlugShape(candidate) || isReservedOrgSlug(candidate)) continue;
    if (!(await input.isTaken(candidate))) return candidate;
  }

  throw new Error('Could not allocate a unique organization slug');
}
