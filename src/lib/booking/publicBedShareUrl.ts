/**
 * Canonical public booking URL for one bed.
 * Lands on the existing room page; booking and price stay on the current funnel.
 */

export type PublicBedShareTarget = {
  pgSlug: string;
  roomId: string;
  bedId: string;
};

export function buildPublicBedSharePath(target: PublicBedShareTarget): string {
  const params = new URLSearchParams({ bed: target.bedId });
  return `/pgs/${encodeURIComponent(target.pgSlug)}/rooms/${encodeURIComponent(target.roomId)}?${params.toString()}`;
}

export function buildPublicBedShareUrl(target: PublicBedShareTarget, origin: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}${buildPublicBedSharePath(target)}`;
}

export function whatsAppShareHref(url: string, text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}
