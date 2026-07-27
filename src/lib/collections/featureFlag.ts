/**
 * COLLECTIONS_V1 — enable Collections Dashboard & related surfaces.
 * On by default; set COLLECTIONS_V1=0 to fall back to Billing Center only.
 */
export function isCollectionsV1Enabled(): boolean {
  const raw = process.env.COLLECTIONS_V1;
  if (raw === undefined || raw === '') return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}
