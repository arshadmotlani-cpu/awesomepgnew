export type RoomDimensionUnit = 'ft' | 'm';

export type RoomDimensions = {
  length?: number;
  width?: number;
  height?: number;
  unit?: RoomDimensionUnit;
};

export function parseRoomDimensions(raw: unknown): RoomDimensions {
  if (!raw || typeof raw !== 'object') return {};
  const d = raw as Record<string, unknown>;
  const result: RoomDimensions = {};
  if (d.unit === 'm' || d.unit === 'ft') result.unit = d.unit;
  if (typeof d.length === 'number' && d.length > 0) result.length = d.length;
  if (typeof d.width === 'number' && d.width > 0) result.width = d.width;
  if (typeof d.height === 'number' && d.height > 0) result.height = d.height;
  return result;
}

/** Area from length × width when both are positive; not stored in DB. */
export function computeRoomArea(dimensions: RoomDimensions): number | null {
  const { length, width } = dimensions;
  if (!length || !width || length <= 0 || width <= 0) return null;
  return length * width;
}

export function formatRoomArea(dimensions: RoomDimensions): string | null {
  const area = computeRoomArea(dimensions);
  if (area == null) return null;
  const unit = dimensions.unit ?? 'ft';
  const suffix = unit === 'm' ? 'sq m' : 'sq ft';
  const rounded = Number.isInteger(area) ? String(area) : area.toFixed(1);
  return `${rounded} ${suffix}`;
}

export function parseMediaUrlList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}
