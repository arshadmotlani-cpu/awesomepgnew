'use client';

import { useActionState, useState } from 'react';
import { saveOfficeLocationAction, type AttendanceActionState } from '@/src/workforce/actions/attendance';
import { DEFAULT_ATTENDANCE_RADIUS_METRES } from '@/src/hair/db/schema/settings';

type Props = {
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialLabel: string | null;
  radiusMetres?: number;
};

export function OfficeLocationSettingsForm({
  initialLatitude,
  initialLongitude,
  initialLabel,
  radiusMetres = DEFAULT_ATTENDANCE_RADIUS_METRES,
}: Props) {
  const [state, formAction, pending] = useActionState(saveOfficeLocationAction, {} as AttendanceActionState);
  const [lat, setLat] = useState(initialLatitude?.toString() ?? '');
  const [lng, setLng] = useState(initialLongitude?.toString() ?? '');

  function useMyLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(String(pos.coords.latitude));
      setLng(String(pos.coords.longitude));
    });
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const mapUrl =
    Number.isFinite(latNum) && Number.isFinite(lngNum)
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${lngNum - 0.002}%2C${latNum - 0.002}%2C${lngNum + 0.002}%2C${latNum + 0.002}&layer=mapnik&marker=${latNum}%2C${lngNum}`
      : null;

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-fyh-text-secondary">
        Attendance radius: <strong>{radiusMetres} m</strong> (staff must be within this distance to mark
        present).
      </p>
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
        Office label
        <input
          name="officeLabel"
          defaultValue={initialLabel ?? ''}
          placeholder="For Your Hair, Shantinagar"
          className="mt-1 w-full rounded border border-[color:var(--fyh-border)] bg-transparent px-3 py-2"
        />
      </label>
      <button
        type="button"
        onClick={useMyLocation}
        className="rounded border border-[color:var(--fyh-border)] px-3 py-1.5 text-sm"
      >
        Use my current location
      </button>
      {mapUrl ? (
        <iframe
          title="Office map preview"
          src={mapUrl}
          className="h-64 w-full rounded border border-[color:var(--fyh-border)]"
        />
      ) : null}
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
