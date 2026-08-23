/** Apex Hair hosts (multi-org picker). Not tenant-bound. Edge-safe (no DB). */
export const HAIR_APEX_HOSTS = new Set([
  'fyhair.awesomepg.in',
  'fyhair.localhost',
  'fyhair.localhost.localdomain',
  'foryourhair.awesomepg.in',
  'foryourhair.localhost',
  'foryourhair.localhost.localdomain',
]);

/**
 * Parent domains that accept `{slug}.<parent>` tenant hosts (Phase F).
 * Plan: `{slug}.fyhair.app`; also awesomepg / localhost for staging.
 */
export const HAIR_TENANT_PARENT_SUFFIXES = [
  '.fyhair.app',
  '.fyhair.awesomepg.in',
  '.fyhair.localhost',
  '.fyhair.localhost.localdomain',
] as const;

const RESERVED_LABELS = new Set([
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
]);

/**
 * Parse tenant org slug from hostname.
 * Returns null on apex Hair hosts or non-Hair hosts.
 */
export function parseHairTenantSlug(hostname: string): string | null {
  const h = hostname.split(':')[0]?.toLowerCase().trim() ?? '';
  if (!h || HAIR_APEX_HOSTS.has(h)) return null;

  for (const suffix of HAIR_TENANT_PARENT_SUFFIXES) {
    if (!h.endsWith(suffix)) continue;
    const label = h.slice(0, h.length - suffix.length);
    if (!label || label.includes('.') || RESERVED_LABELS.has(label)) return null;
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return null;
    return label;
  }
  return null;
}

export function isHairTenantSubdomain(hostname: string): boolean {
  return parseHairTenantSlug(hostname) != null;
}

/**
 * Pure: session org must match host-bound org when on a tenant subdomain.
 */
export function isSessionHostOrgMismatch(
  sessionOrganizationId: string | null | undefined,
  hostOrganizationId: string | null | undefined,
): boolean {
  if (!hostOrganizationId) return false;
  if (!sessionOrganizationId) return true;
  return sessionOrganizationId !== hostOrganizationId;
}
