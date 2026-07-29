/** Collapse whitespace and compare case-insensitively for duplicate detection. */
export function normalizeServiceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Store-friendly service name (trim + single spaces). */
export function canonicalServiceName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
