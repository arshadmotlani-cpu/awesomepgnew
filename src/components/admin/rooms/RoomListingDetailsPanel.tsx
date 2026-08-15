'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  updateRoomDetailsAction,
  updateRoomListingAction,
  uploadRoomImageAction,
  uploadRoomVideoAction,
} from '@/app/(admin)/admin/pgs/inventory-actions';
import { ImageGalleryEditor } from '@/src/components/admin/ImageGalleryEditor';
import { VideoGalleryEditor } from '@/src/components/admin/VideoGalleryEditor';
import { AdminOpsDialog } from '@/src/components/admin/rooms/AdminOpsDialog';
import { formatRoomArea, type RoomDimensions } from '@/src/lib/roomListing';

type Props = {
  open: boolean;
  onClose: () => void;
  pgId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorLabel: string;
  hasAc: boolean;
  roomNotes: string | null;
  listingDescription: string | null;
  images: string[];
  videos: string[];
  dimensions: RoomDimensions;
  blobUploadConfigured?: boolean;
  onToast: (message: string, tone: 'success' | 'error') => void;
};

export function RoomListingDetailsPanel({
  open,
  onClose,
  pgId,
  roomId,
  roomNumber,
  floorNumber,
  floorLabel,
  hasAc,
  roomNotes,
  listingDescription,
  images,
  videos,
  dimensions,
  blobUploadConfigured = false,
  onToast,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'listing' | 'location'>('listing');

  return (
    <AdminOpsDialog
      open={open}
      onClose={onClose}
      title={`Room ${roomNumber} — Details`}
      subtitle={floorLabel}
      variant="drawer"
      width="lg"
    >
      <div className="mb-4 flex gap-2">
        <TabButton active={tab === 'location'} onClick={() => setTab('location')}>
          Location & notes
        </TabButton>
        <TabButton active={tab === 'listing'} onClick={() => setTab('listing')}>
          Listing content
        </TabButton>
      </div>
      {tab === 'location' ? (
        <LocationForm
          pgId={pgId}
          roomId={roomId}
          roomNumber={roomNumber}
          floorNumber={floorNumber}
          floorLabel={floorLabel}
          hasAc={hasAc}
          roomNotes={roomNotes}
          onToast={onToast}
          onSaved={() => router.refresh()}
        />
      ) : (
        <ListingForm
          pgId={pgId}
          roomId={roomId}
          listingDescription={listingDescription}
          images={images}
          videos={videos}
          dimensions={dimensions}
          blobUploadConfigured={blobUploadConfigured}
          onToast={onToast}
          onSaved={() => router.refresh()}
        />
      )}
    </AdminOpsDialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        active
          ? 'bg-[#FF5A1F]/20 text-[#FF5A1F]'
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function LocationForm({
  pgId,
  roomId,
  roomNumber,
  floorNumber,
  floorLabel,
  hasAc,
  roomNotes,
  onToast,
  onSaved,
}: {
  pgId: string;
  roomId: string;
  roomNumber: string;
  floorNumber: number;
  floorLabel: string;
  hasAc: boolean;
  roomNotes: string | null;
  onToast: (message: string, tone: 'success' | 'error') => void;
  onSaved: () => void;
}) {
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
      const msg = result.error ?? "Couldn't save changes. Nothing was changed.";
      setError(msg);
      onToast(msg, 'error');
      return;
    }
    onToast('✓ Room location updated', 'success');
    onSaved();
  }

  return (
    <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="text-zinc-400">Room number</span>
        <input
          required
          value={values.roomNumber}
          onChange={(e) => setValues((v) => ({ ...v, roomNumber: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>
      <label className="text-sm">
        <span className="text-zinc-400">Floor number</span>
        <input
          required
          type="number"
          value={values.floorNumber}
          onChange={(e) => setValues((v) => ({ ...v, floorNumber: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="text-zinc-400">Floor label</span>
        <input
          value={values.floorLabel}
          onChange={(e) => setValues((v) => ({ ...v, floorLabel: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
        <input
          type="checkbox"
          checked={values.hasAc}
          onChange={(e) => setValues((v) => ({ ...v, hasAc: e.target.checked }))}
        />
        Room has AC
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="text-zinc-400">Internal notes</span>
        <textarea
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          rows={2}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
        />
      </label>
      <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save location'}
        </button>
        {error ? <span className="text-sm text-rose-400">{error}</span> : null}
      </div>
    </form>
  );
}

function ListingForm({
  pgId,
  roomId,
  listingDescription,
  images,
  videos,
  dimensions,
  blobUploadConfigured,
  onToast,
  onSaved,
}: {
  pgId: string;
  roomId: string;
  listingDescription: string | null;
  images: string[];
  videos: string[];
  dimensions: RoomDimensions;
  blobUploadConfigured: boolean;
  onToast: (message: string, tone: 'success' | 'error') => void;
  onSaved: () => void;
}) {
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
      const msg = result.error ?? "Couldn't save listing. Nothing was changed.";
      setError(msg);
      onToast(msg, 'error');
      return;
    }
    onToast('✓ Listing details saved', 'success');
    onSaved();
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <p className="text-sm text-zinc-400">
        Optional marketing content for the customer-facing PG site. Not required for bookings.
      </p>
      <label className="block text-sm">
        <span className="text-zinc-400">Room description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
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
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
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
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
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
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
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
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white"
          >
            <option value="ft">ft</option>
            <option value="m">m</option>
          </select>
        </label>
      </div>
      {areaLabel ? <p className="text-xs text-zinc-500">Approx. floor area: {areaLabel}</p> : null}
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
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save listing'}
        </button>
        {error ? <span className="text-sm text-rose-400">{error}</span> : null}
      </div>
    </form>
  );
}
