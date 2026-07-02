/**
 * Public browse availability overrides for specific PGs.
 * These affect only customer-facing rendering/bookability.
 */

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

const ALWAYS_OCCUPIED_PG_SLUGS = new Set([
  'it-park',
  'central-avenue-male',
]);

const ALWAYS_OCCUPIED_PG_NAMES = new Set([
  'it park',
  'central avenue (male)',
]);

export function isPublicAlwaysOccupiedPg(input: {
  pgSlug?: string | null;
  pgName?: string | null;
}): boolean {
  const slug = normalize(input.pgSlug);
  const name = normalize(input.pgName);
  return ALWAYS_OCCUPIED_PG_SLUGS.has(slug) || ALWAYS_OCCUPIED_PG_NAMES.has(name);
}

