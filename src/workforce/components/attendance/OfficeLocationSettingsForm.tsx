'use client';

import { useActionState, useMemo, useState } from 'react';
import { saveOfficeLocationAction, type AttendanceActionState } from '@/src/workforce/actions/attendance';
import { DEFAULT_ATTENDANCE_RADIUS_METRES } from '@/src/hair/db/schema/settings';

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
  const [searching, setSearching] = useState(false);
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

  async function runSearch() {
    const q = searchQuery.trim();
    if (q.length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } },
      );
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      setSearchResults(
        data.map((row) => ({
          displayName: row.display_name,
          lat: Number(row.lat),
          lon: Number(row.lon),
        })),
      );
    } finally {
      setSearching(false);
    }
  }

  function applySearchResult(result: SearchResult) {
    setLat(String(result.lat));
    setLng(String(result.lon));
    if (!label.trim()) setLabel(result.displayName.split(',')[0]?.trim() ?? '');
    setSearchResults([]);
    setSearchQuery('');
  }

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(String(pos.coords.latitude));
      setLng(String(pos.coords.longitude));
    });
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Search this location</label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Salon name, street, city…"
            className="min-w-[240px] flex-1 rounded border border-[color:var(--fyh-border)] bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching}
            className="rounded border border-[color:var(--fyh-border)] px-3 py-2 text-sm"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {searchResults.length > 0 ? (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-[color:var(--fyh-border)] text-sm">
            {searchResults.map((r) => (
              <li key={`${r.lat}-${r.lon}`}>
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
        onClick={useMyLocation}
        className="rounded border border-[color:var(--fyh-border)] px-3 py-1.5 text-sm"
      >
        Use my current location
      </button>

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
