'use client';

import { useActionState, useState } from 'react';
import {
  submitVacatingAction,
  uploadVacatingProofAction,
  type VacatingActionState,
} from '@/app/(customer)/account/resident/actions';
import { defaultVacatingDate } from '@/src/lib/dateDefaults';
import { todayString } from '@/src/lib/dates';
import { ACCOUNT_SURFACE_PRIMARY_BTN } from '@/src/components/customer/accountStyles';

const idleState: VacatingActionState = { status: 'idle' };

export function VacatingRequestForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(submitVacatingAction, idleState);
  const [vacatingDate, setVacatingDate] = useState(defaultVacatingDate);
  const [roomPhotoUrl, setRoomPhotoUrl] = useState('');
  const [meterPhotoUrl, setMeterPhotoUrl] = useState('');
  const [uploadingRoom, setUploadingRoom] = useState(false);
  const [uploadingMeter, setUploadingMeter] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canSubmit = Boolean(roomPhotoUrl && meterPhotoUrl && vacatingDate);

  async function handleProofUpload(
    file: File | null,
    kind: 'room' | 'meter',
  ) {
    if (!file) return;
    setUploadError(null);
    if (kind === 'room') setUploadingRoom(true);
    else setUploadingMeter(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('kind', kind);
      const url = await uploadVacatingProofAction(fd);
      if (kind === 'room') setRoomPhotoUrl(url);
      else setMeterPhotoUrl(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      if (kind === 'room') setUploadingRoom(false);
      else setUploadingMeter(false);
    }
  }

  return (
    <form
      action={action}
      data-roachie-focus="vacating"
      className="apg-account-surface space-y-4 rounded-xl border border-zinc-200 p-5 shadow-sm"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="roomPhotoUrl" value={roomPhotoUrl} />
      <input type="hidden" name="meterPhotoUrl" value={meterPhotoUrl} />

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">
          Vacate date
        </span>
        <input
          type="date"
          name="vacatingDate"
          required
          min={todayString()}
          value={vacatingDate}
          onChange={(e) => setVacatingDate(e.target.value)}
          className="apg-admin-field mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm font-medium text-zinc-900">Required proof</p>
        <p className="text-xs text-zinc-600">
          Upload photos before submitting. Admin reviews your request before any refund is
          calculated.
        </p>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">
            Room condition photo
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="mt-1 block w-full text-sm text-zinc-700"
            disabled={uploadingRoom}
            onChange={(e) => void handleProofUpload(e.target.files?.[0] ?? null, 'room')}
          />
          {roomPhotoUrl ? (
            <p className="mt-1 text-xs text-emerald-700">Room photo uploaded</p>
          ) : null}
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">
            Electricity meter photo
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="mt-1 block w-full text-sm text-zinc-700"
            disabled={uploadingMeter}
            onChange={(e) => void handleProofUpload(e.target.files?.[0] ?? null, 'meter')}
          />
          {meterPhotoUrl ? (
            <p className="mt-1 text-xs text-emerald-700">Meter photo uploaded</p>
          ) : null}
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          rows={2}
          className="apg-admin-field mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Anything the office should know about your move-out"
        />
      </label>

      <button
        type="submit"
        disabled={pending || !canSubmit}
        className={`w-full ${ACCOUNT_SURFACE_PRIMARY_BTN} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {pending ? 'Submitting…' : 'Submit vacate request'}
      </button>

      {uploadError ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{uploadError}</p>
      ) : null}

      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
