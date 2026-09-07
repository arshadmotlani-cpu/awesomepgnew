/** Earth radius in metres (WGS84 mean). */
const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance between two WGS84 coordinates in metres. */
export function distanceMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

export function isWithinRadiusMetres(
  deviceLat: number,
  deviceLon: number,
  officeLat: number,
  officeLon: number,
  radiusMetres: number,
  gpsAccuracyMetres?: number | null,
): boolean {
  const distance = distanceMetres(deviceLat, deviceLon, officeLat, officeLon);
  const accuracyBuffer = Math.max(0, gpsAccuracyMetres ?? 0);
  return distance <= radiusMetres + accuracyBuffer;
}

export function isPlausibleGpsReading(input: {
  latitude: number;
  longitude: number;
  accuracyMetres?: number | null;
}): boolean {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) return false;
  if (input.latitude < -90 || input.latitude > 90) return false;
  if (input.longitude < -180 || input.longitude > 180) return false;
  if (input.accuracyMetres != null) {
    if (!Number.isFinite(input.accuracyMetres) || input.accuracyMetres <= 0) return false;
    if (input.accuracyMetres > 500) return false;
  }
  return true;
}

export function isSuspiciouslyInaccurateGps(accuracyMetres?: number | null): boolean {
  return accuracyMetres != null && accuracyMetres > 100;
}
