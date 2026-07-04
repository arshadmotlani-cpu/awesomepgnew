/**
 * @deprecated Public availability overrides removed — occupancy SSOT is authoritative.
 * Kept only so stale imports fail loudly during migration; always returns false.
 */
export function isPublicAlwaysOccupiedPg(_input: {
  pgSlug?: string | null;
  pgName?: string | null;
}): boolean {
  return false;
}
