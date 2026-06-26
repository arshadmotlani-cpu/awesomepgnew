/**
 * Public website PG display names and sort order.
 * Canonical `pgs.name` / slug stay unchanged for admin and booking history.
 */

export type PublicPgPresentationInput = {
  name: string;
  slug: string;
  publicDisplayName?: string | null;
  displayOrder?: number | null;
};

type PublicPgPreset = {
  match: (row: Pick<PublicPgPresentationInput, 'name' | 'slug'>) => boolean;
  displayName: string;
  displayOrder: number;
};

/** Fallback when DB columns are unset (dev / pre-migration). Production uses DB values. */
export const PUBLIC_PG_PRESETS: PublicPgPreset[] = [
  {
    match: (r) => /trimurti/i.test(r.name) || /trimurti/i.test(r.slug),
    displayName: 'IT PARK',
    displayOrder: 1,
  },
  {
    match: (r) => /shantinagar/i.test(r.name) || /shantinagar/i.test(r.slug),
    displayName: 'SHANTINAGAR - AWESOME PG',
    displayOrder: 2,
  },
  {
    match: (r) =>
      /central.?avenue/i.test(r.name) ||
      /central-avenue/i.test(r.slug) ||
      (/central/i.test(r.name) && !/female/i.test(r.name) && !/female/i.test(r.slug)),
    displayName: 'CENTRAL AVENUE - AWESOME PG',
    displayOrder: 3,
  },
];

function presetFor(row: Pick<PublicPgPresentationInput, 'name' | 'slug'>): PublicPgPreset | null {
  return PUBLIC_PG_PRESETS.find((p) => p.match(row)) ?? null;
}

export function resolvePublicPgDisplayName(row: PublicPgPresentationInput): string {
  const trimmed = row.publicDisplayName?.trim();
  if (trimmed) return trimmed;
  return presetFor(row)?.displayName ?? row.name;
}

export function resolvePublicPgDisplayOrder(row: PublicPgPresentationInput): number | null {
  if (row.displayOrder != null && Number.isFinite(row.displayOrder)) {
    return row.displayOrder;
  }
  return presetFor(row)?.displayOrder ?? null;
}

export function applyPublicPgPresentation<T extends PublicPgPresentationInput>(
  row: T,
): T & { name: string; displayOrder: number | null } {
  return {
    ...row,
    name: resolvePublicPgDisplayName(row),
    displayOrder: resolvePublicPgDisplayOrder(row),
  };
}

export function sortPublicPgs<T extends { displayOrder: number | null; name: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const ao = a.displayOrder ?? 9999;
    const bo = b.displayOrder ?? 9999;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name, 'en-IN');
  });
}
