'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveOfficeLocationAction, type AttendanceActionState } from '@/src/workforce/actions/attendance';
import { DEFAULT_ATTENDANCE_RADIUS_METRES } from '@/src/hair/db/schema/settings';
import { readCurrentGeolocation } from '@/src/workforce/lib/geolocationClient';

type Props = {
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialLabel: string | null;
  radiusMetres?: number;
};

type SearchResult = { displayName: string; lat: number; lon: number };

export function OfficeLocationSettingsForm({
  initialLatitude,
  initialLongitude,
  initialLabel,
  radiusMetres = DEFAULT_ATTENDANCE_RADIUS_METRES,
}: Props) {
  const [state, formAction, pending] = useActionState(saveOfficeLocationAction, {} as AttendanceActionState);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [lat, setLat] = useState(initialLatitude?.toString() ?? '');
  const [lng, setLng] = useState(initialLongitude?.toString() ?? '');
  const [label, setLabel] = useState(initialLabel ?? '');
  const [radius, setRadius] = useState(String(radiusMetres));

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const mapUrl = useMemo(() => {
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
    const pad = 0.003;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${lngNum - pad}%2C${latNum - pad}%2C${lngNum + pad}%2C${latNum + pad}&layer=mapnik&marker=${latNum}%2C${lngNum}`;
  }, [latNum, lngNum]);

  function applyCoordinates(nextLat: number, nextLng: number, suggestedLabel?: string) {
    setLat(String(nextLat));
    setLng(String(nextLng));
    if (suggestedLabel && !label.trim()) {
      setLabel(suggestedLabel.split(',')[0]?.trim() ?? suggestedLabel);
    }
    setSearchResults([]);
    setSearchQuery('');
    setSearchError(null);
    setLocationMessage(null);
  }

  async function runSearch() {
    const q = searchQuery.trim();
    if (q.length < 3 || searching) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const res = await fetch(`/fyh/api/office-location/geocode?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: SearchResult[]; error?: string };
      if (!res.ok) {
        setSearchError(data.error ?? 'Location search failed. Please try again.');
        return;
      }
      const results = data.results ?? [];
      if (results.length === 0) {
        setSearchError('No matching location found. Try a fuller address or business name.');
        return;
      }
      if (results.length === 1) {
        applyCoordinates(results[0]!.lat, results[0]!.lon, results[0]!.displayName);
        return;
      }
      setSearchResults(results);
    } catch {
      setSearchError('Location search failed. Check your connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  function applySearchResult(result: SearchResult) {
    applyCoordinates(result.lat, result.lon, result.displayName);
  }

  async function useMyLocation() {
    if (locating) return;
    setLocationMessage(null);
    setSearchError(null);

    if (!navigator.geolocation) {
      setLocationMessage(
        'This browser does not support location access. Enter coordinates manually or search for your office.',
      );
      return;
    }

    setLocating(true);
    setLocationMessage('Reading your current location…');
    try {
      const result = await readCurrentGeolocation(navigator.geolocation);
      if (!result.ok) {
        setLocationMessage(result.error);
        return;
      }
      applyCoordinates(result.lat, result.lng);
      setLocationMessage(
        result.accuracyMetres != null
          ? `Current location loaded (±${Math.round(result.accuracyMetres)}m). Adjust if needed, then save.`
          : 'Current location loaded. Adjust if needed, then save.',
      );
    } finally {
      setLocating(false);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Search this location</label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Salon name, street, city…"
            className="min-w-[240px] flex-1 rounded border border-[color:var(--fyh-border)] bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching || searchQuery.trim().length < 3}
            className="rounded border border-[color:var(--fyh-border)] px-3 py-2 text-sm disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {searchError ? <p className="mt-2 text-sm text-amber-300">{searchError}</p> : null}
        {searchResults.length > 0 ? (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-[color:var(--fyh-border)] text-sm">
            {searchResults.map((r) => (
              <li key={`${r.lat}-${r.lon}-${r.displayName}`}>
                <button
                  type="button"
                  onClick={() => applySearchResult(r)}
                  className="block w-full px-3 py-2 text-left hover:bg-white/5"
                >
                  {r.displayName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {mapUrl ? (
        <iframe
          title="Office map"
          src={mapUrl}
          className="h-64 w-full rounded border border-[color:var(--fyh-border)]"
        />
      ) : (
        <div className="flex h-64 items-center justify-center rounded border border-dashed border-[color:var(--fyh-border)] text-sm text-fyh-text-secondary">
          Search or enter coordinates to preview the map
        </div>
      )}

      <label className="block text-sm">
        Office name
        <input
          name="officeLabel"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Your salon / office name"
          className="mt-1 w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Latitude
          <input
            name="officeLatitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            required
            className="mt-1 w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Longitude
          <input
            name="officeLongitude"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            required
            className="mt-1 w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm">
        Attendance radius (metres)
        <input
          name="officeRadiusMetres"
          type="number"
          min={1}
          max={500}
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          className="mt-1 w-full max-w-xs rounded border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
        />
      </label>

      <button
        type="button"
        onClick={() => void useMyLocation()}
        disabled={locating}
        className="rounded border border-[color:var(--fyh-border)] px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {locating ? 'Reading location…' : 'Use my current location'}
      </button>
      {locationMessage ? <p className="text-sm text-fyh-text-secondary">{locationMessage}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-fyh-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save office location'}
      </button>

      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400">{state.success}</p> : null}
    </form>
  );
}
