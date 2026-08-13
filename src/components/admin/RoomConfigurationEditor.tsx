'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  archiveBedAction,
  moveBedToRoomAction,
  renameBedCodeAction,
  resizeRoomCapacityAction,
  updateBedStatusInventoryAction,
  updateRoomDetailsAction,
  updateRoomListingAction,
  uploadRoomImageAction,
  uploadRoomVideoAction,
  updateRoomPricingAction,
} from '@/app/(admin)/admin/pgs/inventory-actions';
import { ImageGalleryEditor } from '@/src/components/admin/ImageGalleryEditor';
import { VideoGalleryEditor } from '@/src/components/admin/VideoGalleryEditor';
import { paiseToInr } from '@/src/lib/format';
import {
  formatRoomArea,
  type RoomDimensions,
} from '@/src/lib/roomListing';
import {
  getRoomConfigurationPreset,
  presetIdFromBedCountAndName,
  type RoomConfigurationPresetId,
} from '@/src/lib/roomConfigurationPresets';
import { buildIntegrityPreview, previewFromBeds } from '@/src/lib/roomIntegrity/roomIntegrityPreview';
import type { RoomIntegrityResult } from '@/src/lib/roomIntegrity/types';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';
import { RoomIntegrityBadge } from '@/src/components/admin/RoomIntegrityBadge';
import { RoomIntegrityPreview } from '@/src/components/admin/RoomIntegrityPreview';
import { BedPreviewList, RoomTypeSelector } from '@/src/components/admin/RoomTypeSelector';

type MoveTarget = { roomId: string; label: string };

export function RoomConfigurationEditor({
  pgId,
  roomId,
  roomNumber,
  floorNumber,
  floorLabel,
  roomTypeName,
  hasAc,
  roomNotes,
  listingDescription,
  images,
  videos,
  dimensions,
  blobUploadConfigured = false,
  beds,
  integrity,
  moveTargets,
}: {
  pgId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorLabel: string;
  roomTypeName: string;
  hasAc: boolean;
  roomNotes: string | null;
  listingDescription: string | null;
  images: string[];
  videos: string[];
  dimensions: RoomDimensions;
  blobUploadConfigured?: boolean;
  beds: PgInventoryBedRow[];
  integrity?: RoomIntegrityResult;
  moveTargets: MoveTarget[];
}) {
  const router = useRouter();
  const [presetId, setPresetId] = useState<RoomConfigurationPresetId>(() =>
    presetIdFromBedCountAndName(beds.length, roomTypeName),
  );
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bedError, setBedError] = useState<string | null>(null);

  const preset = getRoomConfigurationPreset(presetId);
  const targetChanged = preset.bedCount !== beds.length || preset.roomTypeName !== roomTypeName;

  const capacityBlocked =
    preset.bedCount < beds.length &&
    (integrity?.occupiedBeds ?? 0) > preset.bedCount;

  const previewState = useMemo(() => {
    const bedStatuses = beds.map((b) => ({
      status: b.bedStatus as 'available' | 'maintenance' | 'blocked',
      occupied: false,
    }));
    while (bedStatuses.length < preset.bedCount) {
      bedStatuses.push({ status: 'available', occupied: false });
    }
    return previewFromBeds({
      roomTypeName: preset.roomTypeName,
      targetBedCount: preset.bedCount,
      beds: bedStatuses.slice(0, preset.bedCount),
      occupiedBeds: integrity?.occupiedBeds ?? 0,
    });
  }, [beds, preset, integrity?.occupiedBeds]);

  const previewResult = buildIntegrityPreview(previewState);
  const previewIssues = capacityBlocked
    ? [
        {
          code: 'occupied_exceeds_capacity' as const,
          message: `Cannot reduce room capacity. ${integrity?.occupiedBeds ?? 0} active resident${(integrity?.occupiedBeds ?? 0) === 1 ? '' : 's'} currently occupy this room. Vacate or move ${(integrity?.occupiedBeds ?? 0) - preset.bedCount} resident${(integrity?.occupiedBeds ?? 0) - preset.bedCount === 1 ? '' : 's'} first.`,
        },
      ]
    : previewResult.ok
      ? []
      : previewResult.issues;

  async function applyRoomType() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('presetId', presetId);
    if (beds[0]) {
      fd.set('dailyRate', String(beds[0].monthlyRatePaise / 100));
      fd.set('weeklyRate', String(beds[0].weeklyRatePaise / 100));
      fd.set('monthlyRate', String(beds[0].monthlyRatePaise / 100));
      fd.set('dailyDeposit', String(beds[0].dailyDepositPaise / 100));
      fd.set('weeklyDeposit', String(beds[0].weeklyDepositPaise / 100));
      fd.set('monthlyDeposit', String(beds[0].monthlyDepositPaise / 100));
    }
    const result = await resizeRoomCapacityAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to update room type');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-white">
            Room {roomNumber}
            <span className="ml-2 text-sm font-normal text-zinc-500">{floorLabel}</span>
          </h4>
          <p className="mt-0.5 text-xs text-zinc-400">
            {roomTypeName}
            {hasAc ? ' · AC' : ''}
            {' · '}
            {beds.length} bed{beds.length === 1 ? '' : 's'}
          </p>
          <RoomIntegrityBadge integrity={integrity} />
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            setError(null);
            setPresetId(presetIdFromBedCountAndName(beds.length, roomTypeName));
          }}
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          {editing ? 'Close editor' : 'Configure room'}
        </button>
      </div>

      {editing ? (
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-300">Room type</p>
            <RoomTypeSelector
              value={presetId}
              onChange={setPresetId}
              disabled={pending}
            />
          </div>

          {preset.bedCount !== beds.length ? (
            <BedPreviewList presetId={presetId} />
          ) : null}

          <RoomIntegrityPreview
            capacity={previewState.storedCapacity}
            physicalBeds={previewState.physicalBeds}
            bookableBeds={previewState.bookableBeds}
            occupiedBeds={previewState.occupiedBeds}
            blockedBeds={previewState.blockedBeds}
            maintenanceBeds={previewState.maintenanceBeds}
            issues={previewIssues}
          />

          {targetChanged ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={pending || previewIssues.length > 0}
                onClick={applyRoomType}
                className="rounded-lg bg-[#FF5A1F] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? 'Saving…' : `Apply ${preset.label}`}
              </button>
              {error ? <span className="text-sm text-rose-400">{error}</span> : null}
            </div>
          ) : null}

          <RoomDetailsInline
            pgId={pgId}
            roomId={roomId}
            roomNumber={roomNumber}
            floorNumber={floorNumber}
            floorLabel={floorLabel}
            hasAc={hasAc}
            roomNotes={roomNotes}
          />

          <RoomListingInline
            pgId={pgId}
            roomId={roomId}
            listingDescription={listingDescription}
            images={images}
            videos={videos}
            dimensions={dimensions}
            blobUploadConfigured={blobUploadConfigured}
          />

          <BedManagementTable
            pgId={pgId}
            roomId={roomId}
            beds={beds}
            moveTargets={moveTargets.filter((t) => t.roomId !== roomId)}
            onError={setBedError}
          />

          <RoomRentInline pgId={pgId} roomId={roomId} beds={beds} />

          {bedError ? <p className="text-sm text-rose-400">{bedError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function RoomDetailsInline({
  pgId,
  roomId,
  roomNumber,
  floorNumber,
  floorLabel,
  hasAc,
  roomNotes,
}: {
  pgId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorLabel: string;
  hasAc: boolean;
  roomNotes: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    roomNumber,
    floorNumber: String(floorNumber),
    floorLabel: floorLabel.startsWith('Floor ') ? '' : floorLabel,
    hasAc,
    notes: roomNotes ?? '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    fd.set('roomNumber', values.roomNumber);
    fd.set('floorNumber', values.floorNumber);
    fd.set('floorLabel', values.floorLabel);
    if (values.hasAc) fd.set('hasAc', 'on');
    fd.set('notes', values.notes);
    const result = await updateRoomDetailsAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save');
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="grid gap-3 rounded-lg border border-zinc-800 p-3 sm:grid-cols-3">
      <p className="sm:col-span-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Location & notes
      </p>
      <label className="text-sm">
        <span className="text-zinc-400">Room number</span>
        <input
          required
          value={values.roomNumber}
          onChange={(e) => setValues((v) => ({ ...v, roomNumber: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
        />
      </label>
      <label className="text-sm">
        <span className="text-zinc-400">Floor number</span>
        <input
          required
          type="number"
          value={values.floorNumber}
          onChange={(e) => setValues((v) => ({ ...v, floorNumber: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
        />
      </label>
      <label className="text-sm">
        <span className="text-zinc-400">Floor label</span>
        <input
          value={values.floorLabel}
          onChange={(e) => setValues((v) => ({ ...v, floorLabel: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-3">
        <input
          type="checkbox"
          checked={values.hasAc}
          onChange={(e) => setValues((v) => ({ ...v, hasAc: e.target.checked }))}
        />
        Room has AC
      </label>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save location'}
        </button>
        {error ? <span className="text-sm text-rose-400">{error}</span> : null}
      </div>
    </form>
  );
}

function RoomListingInline({
  pgId,
  roomId,
  listingDescription,
  images,
  videos,
  dimensions,
  blobUploadConfigured,
}: {
  pgId: string;
  roomId: string;
  listingDescription: string | null;
  images: string[];
  videos: string[];
  dimensions: RoomDimensions;
  blobUploadConfigured: boolean;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(listingDescription ?? '');
  const [dims, setDims] = useState({
    length: dimensions.length != null ? String(dimensions.length) : '',
    width: dimensions.width != null ? String(dimensions.width) : '',
    height: dimensions.height != null ? String(dimensions.height) : '',
    unit: dimensions.unit ?? 'ft',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areaLabel = formatRoomArea({
    length: Number.parseFloat(dims.length) || undefined,
    width: Number.parseFloat(dims.width) || undefined,
    unit: dims.unit === 'm' ? 'm' : 'ft',
  });

  async function onSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set('roomId', roomId);
    fd.set('listingDescription', description);
    fd.set(
      'dimensions',
      JSON.stringify({
        length: Number.parseFloat(dims.length) || undefined,
        width: Number.parseFloat(dims.width) || undefined,
        height: Number.parseFloat(dims.height) || undefined,
        unit: dims.unit,
      }),
    );
    const result = await updateRoomListingAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save listing');
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSave} className="space-y-4 rounded-lg border border-zinc-800 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Room listing (customer site)</p>

      <label className="block text-sm">
        <span className="text-zinc-400">Room description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
          placeholder="What makes this room special for guests?"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-4">
        <label className="text-sm">
          <span className="text-zinc-400">Length</span>
          <input
            type="number"
            min={0}
            step="0.1"
            value={dims.length}
            onChange={(e) => setDims((d) => ({ ...d, length: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Width</span>
          <input
            type="number"
            min={0}
            step="0.1"
            value={dims.width}
            onChange={(e) => setDims((d) => ({ ...d, width: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Height</span>
          <input
            type="number"
            min={0}
            step="0.1"
            value={dims.height}
            onChange={(e) => setDims((d) => ({ ...d, height: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Unit</span>
          <select
            value={dims.unit}
            onChange={(e) =>
              setDims((d) => ({
                ...d,
                unit: e.target.value === 'm' ? 'm' : 'ft',
              }))
            }
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
          >
            <option value="ft">ft</option>
            <option value="m">m</option>
          </select>
        </label>
      </div>
      {areaLabel ? (
        <p className="text-xs text-zinc-500">Approx. floor area: {areaLabel}</p>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Room photos</p>
        <ImageGalleryEditor
          name="images"
          initialImages={images}
          onUpload={
            blobUploadConfigured
              ? async (file) => {
                  const fd = new FormData();
                  fd.set('file', file);
                  return uploadRoomImageAction(pgId, roomId, fd);
                }
              : undefined
          }
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-300">Room videos</p>
        <VideoGalleryEditor
          name="videos"
          initialVideos={videos}
          onUpload={
            blobUploadConfigured
              ? async (file) => {
                  const fd = new FormData();
                  fd.set('file', file);
                  return uploadRoomVideoAction(pgId, roomId, fd);
                }
              : undefined
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save listing'}
        </button>
        {error ? <span className="text-sm text-rose-400">{error}</span> : null}
      </div>
    </form>
  );
}

function RoomRentInline({
  pgId,
  roomId,
  beds,
}: {
  pgId: string;
  roomId: string;
  beds: PgInventoryBedRow[];
}) {
  const router = useRouter();
  const first = beds[0];
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    dailyRate: first ? String(first.dailyRatePaise / 100) : '',
    weeklyRate: first ? String(first.weeklyRatePaise / 100) : '',
    monthlyRate: first ? String(first.monthlyRatePaise / 100) : '',
    dailyDeposit: first ? String(first.dailyDepositPaise / 100) : '',
    weeklyDeposit: first ? String(first.weeklyDepositPaise / 100) : '',
    monthlyDeposit: first ? String(first.monthlyDepositPaise / 100) : '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set('roomId', roomId);
    Object.entries(values).forEach(([k, v]) => fd.set(k, v));
    const result = await updateRoomPricingAction(pgId, fd);
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? 'Failed to save rent');
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!first) return null;

  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Rent (all beds)
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-[#FF5A1F] hover:underline"
        >
          {open ? 'Cancel' : 'Edit rent'}
        </button>
      </div>
      {!open ? (
        <p className="mt-1 text-sm text-zinc-300">
          Monthly {paiseToInr(first.monthlyRatePaise)} · Weekly{' '}
          {first.weeklyRatePaise > 0 ? paiseToInr(first.weeklyRatePaise) : '—'}
        </p>
      ) : (
        <form onSubmit={onSave} className="mt-3 grid gap-3 sm:grid-cols-3">
          {(['dailyRate', 'weeklyRate', 'monthlyRate'] as const).map((key) => (
            <label key={key} className="text-sm">
              <span className="text-zinc-400 capitalize">{key.replace('Rate', ' rent')} (₹)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                required={key === 'monthlyRate'}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
              />
            </label>
          ))}
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save rent'}
            </button>
            {error ? <span className="text-sm text-rose-400">{error}</span> : null}
          </div>
        </form>
      )}
    </div>
  );
}

function BedManagementTable({
  pgId,
  roomId,
  beds,
  moveTargets,
  onError,
}: {
  pgId: string;
  roomId: string;
  beds: PgInventoryBedRow[];
  moveTargets: MoveTarget[];
  onError: (msg: string | null) => void;
}) {
  const router = useRouter();
  const [busyBedId, setBusyBedId] = useState<string | null>(null);
  const [renameBedId, setRenameBedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveBedId, setMoveBedId] = useState<string | null>(null);
  const [moveTargetRoomId, setMoveTargetRoomId] = useState('');

  async function runBedAction(bedId: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyBedId(bedId);
    onError(null);
    const result = await fn();
    setBusyBedId(null);
    if (!result.ok) {
      onError(result.error ?? 'Action failed');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Bed management
      </p>
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="pb-2 pr-3">Bed</th>
            <th className="pb-2 pr-3">Status</th>
            <th className="pb-2 pr-3">Rent</th>
            <th className="pb-2">Actions</th>
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          {beds.map((bed) => (
            <tr key={bed.bedId} className="border-t border-zinc-800/80">
              <td className="py-2 pr-3 font-medium text-white">
                {renameBedId === bed.bedId ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void runBedAction(bed.bedId, () =>
                        renameBedCodeAction(pgId, bed.bedId, renameValue),
                      ).then(() => setRenameBedId(null));
                    }}
                  >
                    <input
                      required
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                    />
                    <button type="submit" className="text-xs text-[#FF5A1F]">
                      Save
                    </button>
                  </form>
                ) : (
                  bed.bedCode
                )}
              </td>
              <td className="py-2 pr-3 capitalize">
                {bed.bedStatus === 'maintenance' ? 'disabled' : bed.bedStatus}
              </td>
              <td className="py-2 pr-3">{paiseToInr(bed.monthlyRatePaise)}</td>
              <td className="py-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  {bed.bedStatus === 'available' ? (
                    <button
                      type="button"
                      disabled={busyBedId === bed.bedId}
                      onClick={() =>
                        runBedAction(bed.bedId, () =>
                          updateBedStatusInventoryAction(pgId, bed.bedId, 'maintenance'),
                        )
                      }
                      className="text-amber-400 hover:underline disabled:opacity-50"
                    >
                      Disable
                    </button>
                  ) : bed.bedStatus === 'maintenance' || bed.bedStatus === 'blocked' ? (
                    <button
                      type="button"
                      disabled={busyBedId === bed.bedId}
                      onClick={() =>
                        runBedAction(bed.bedId, () =>
                          updateBedStatusInventoryAction(pgId, bed.bedId, 'available'),
                        )
                      }
                      className="text-emerald-400 hover:underline disabled:opacity-50"
                    >
                      Enable
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyBedId === bed.bedId}
                    onClick={() => {
                      setRenameBedId(bed.bedId);
                      setRenameValue(bed.bedCode);
                    }}
                    className="text-zinc-400 hover:underline disabled:opacity-50"
                  >
                    Rename
                  </button>
                  {moveTargets.length > 0 ? (
                    <button
                      type="button"
                      disabled={busyBedId === bed.bedId}
                      onClick={() => {
                        setMoveBedId(bed.bedId);
                        setMoveTargetRoomId(moveTargets[0]?.roomId ?? '');
                      }}
                      className="text-zinc-400 hover:underline disabled:opacity-50"
                    >
                      Move
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyBedId === bed.bedId}
                    onClick={() => {
                      if (!window.confirm(`Archive bed ${bed.bedCode}?`)) return;
                      void runBedAction(bed.bedId, () => archiveBedAction(pgId, bed.bedId));
                    }}
                    className="text-rose-400 hover:underline disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
                {moveBedId === bed.bedId ? (
                  <form
                    className="mt-2 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void runBedAction(bed.bedId, () =>
                        moveBedToRoomAction(pgId, bed.bedId, moveTargetRoomId),
                      ).then(() => setMoveBedId(null));
                    }}
                  >
                    <select
                      required
                      value={moveTargetRoomId}
                      onChange={(e) => setMoveTargetRoomId(e.target.value)}
                      className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                    >
                      {moveTargets.map((t) => (
                        <option key={t.roomId} value={t.roomId}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs text-[#FF5A1F]">
                      Move bed
                    </button>
                    <button
                      type="button"
                      onClick={() => setMoveBedId(null)}
                      className="text-xs text-zinc-500"
                    >
                      Cancel
                    </button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
