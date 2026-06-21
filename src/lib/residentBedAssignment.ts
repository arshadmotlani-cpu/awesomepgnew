export type ResidentTenancyStatus =
  | 'unassigned'
  | 'active'
  | 'vacating'
  | 'vacated'
  | 'blocked';

/** Minimal bed-assignment fields shared by residents list, search, and ops queues. */
export type ResidentBedContext = {
  tenancyStatus?: ResidentTenancyStatus | null;
  bedId?: string | null;
  bookingId?: string | null;
};

/** True when the resident has a confirmed primary reservation (today or upcoming). */
export function isResidentBedAssigned(ctx: ResidentBedContext): boolean {
  if (ctx.bedId && ctx.bookingId) return true;
  return ctx.tenancyStatus === 'active' || ctx.tenancyStatus === 'vacating';
}

export function isResidentBedAssignable(ctx: ResidentBedContext): boolean {
  if (ctx.tenancyStatus === 'blocked' || ctx.tenancyStatus === 'vacated') return false;
  return !isResidentBedAssigned(ctx);
}

export function assignedBedShortLabel(ctx: {
  roomNumber?: string | null;
  bedCode?: string | null;
}): string | null {
  if (!ctx.roomNumber && !ctx.bedCode) return null;
  const parts = [
    ctx.roomNumber ? `Room ${ctx.roomNumber}` : null,
    ctx.bedCode ?? null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function viewBedAdminHref(input: {
  pgId?: string | null;
  bedId?: string | null;
}): string | null {
  if (!input.pgId || !input.bedId) return null;
  return `/admin/beds?pgId=${input.pgId}&bedId=${input.bedId}`;
}
