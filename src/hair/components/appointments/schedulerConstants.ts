/** Fixed 30-minute scheduler grid (Spalon-style day view). */
export const SLOT_MIN = 30;
export const SLOT_WIDTH_PX = 52;
export const STAFF_ROW_HEIGHT_PX = 56;
export const STAFF_COL_WIDTH_PX = 132;
export const TIME_HEADER_HEIGHT_PX = 32;

export function snapMinutes(mins: number): number {
  return Math.round(mins / SLOT_MIN) * SLOT_MIN;
}

export function slotCountBetween(dayStartHour: number, dayEndHour: number): number {
  return ((dayEndHour - dayStartHour) * 60) / SLOT_MIN;
}

export function minutesToSlotLabel(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
