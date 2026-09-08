export type CurrentLocationResult =
  | { ok: true; lat: number; lng: number; accuracyMetres: number | null }
  | { ok: false; error: string };

export function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return 'Location permission denied. Enable location access for this site in your browser settings, then try again.';
    case 2:
      return 'Could not determine your location. Check that GPS or location services are enabled on your device.';
    case 3:
      return 'Location request timed out. Move to an open area or try again.';
    default:
      return 'Could not read your current location. Please allow location access and try again.';
  }
}

export async function readCurrentGeolocation(
  geolocation: Pick<Geolocation, 'getCurrentPosition'>,
): Promise<CurrentLocationResult> {
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyMetres: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        }),
      (err) => resolve({ ok: false, error: geolocationErrorMessage(err.code) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
