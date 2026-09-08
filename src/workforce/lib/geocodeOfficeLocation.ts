export type GeocodeOfficeResult = {
  displayName: string;
  lat: number;
  lon: number;
};

export type GeocodeOfficeResponse =
  | { ok: true; results: GeocodeOfficeResult[] }
  | { ok: false; error: string };

const NOMINATIM_USER_AGENT = 'AwesomePG-FYHAIR/1.0 (attendance office location settings)';

export async function geocodeOfficeLocationQuery(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeOfficeResponse> {
  const q = query.trim();
  if (q.length < 3) {
    return { ok: false, error: 'Enter at least 3 characters to search.' };
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', q);

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': NOMINATIM_USER_AGENT,
      },
    });
  } catch {
    return { ok: false, error: 'Location search is temporarily unavailable. Please try again.' };
  }

  if (!res.ok) {
    return { ok: false, error: 'Location search is temporarily unavailable. Please try again.' };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'Could not read location search results.' };
  }

  if (!Array.isArray(data) || data.length === 0) {
    return {
      ok: false,
      error: 'No matching location found. Try a fuller address or business name.',
    };
  }

  const results = data
    .map((row) => {
      const item = row as { display_name?: string; lat?: string; lon?: string };
      return {
        displayName: item.display_name?.trim() ?? '',
        lat: Number(item.lat),
        lon: Number(item.lon),
      };
    })
    .filter((row) => row.displayName && Number.isFinite(row.lat) && Number.isFinite(row.lon));

  if (results.length === 0) {
    return {
      ok: false,
      error: 'No matching location found. Try a fuller address or business name.',
    };
  }

  return { ok: true, results };
}
