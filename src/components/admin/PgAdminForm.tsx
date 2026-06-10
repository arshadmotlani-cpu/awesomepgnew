'use client';

import { motion } from 'framer-motion';
import { useActionState } from 'react';
import type { Pg } from '@/src/db/schema';
import {
  createPgAction,
  updatePgAction,
  type PgFormState,
} from '@/app/(admin)/admin/pgs/actions';
import { ImageGalleryEditor } from '@/src/components/admin/ImageGalleryEditor';

const AMENITY_KEYS = [
  ['wifi', 'Wi-Fi'],
  ['food', 'Food'],
  ['laundry', 'Laundry'],
  ['parking', 'Parking'],
  ['ac', 'AC'],
  ['housekeeping', 'Housekeeping'],
  ['powerBackup', 'Power backup'],
] as const;

type Props = {
  mode: 'create' | 'edit';
  pg?: Pg;
  cloudinaryUploadAction?: (formData: FormData) => Promise<string>;
};

const initial: PgFormState = { ok: false };

export function PgAdminForm({ mode, pg, cloudinaryUploadAction }: Props) {
  const action =
    mode === 'create'
      ? createPgAction
      : updatePgAction.bind(null, pg!.id);

  const [state, formAction, pending] = useActionState(action, initial);

  const handleUpload = cloudinaryUploadAction
    ? async (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return cloudinaryUploadAction(fd);
      }
    : undefined;

  return (
    <motion.form
      action={formAction}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur"
    >
      {state.error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {state.error}
        </p>
      ) : null}
      {state.ok && mode === 'edit' ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Saved successfully.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-zinc-400">Name *</span>
          <input
            name="name"
            required
            defaultValue={pg?.name}
            className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Slug</span>
          <input
            name="slug"
            defaultValue={pg?.slug}
            className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-zinc-400">Address line 1 *</span>
        <input
          name="addressLine1"
          required
          defaultValue={pg?.addressLine1}
          className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-zinc-400">City *</span>
          <input name="city" required defaultValue={pg?.city} className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">State *</span>
          <input name="state" required defaultValue={pg?.state} className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">PIN *</span>
          <input name="pincode" required defaultValue={pg?.pincode} className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
        </label>
      </div>

      <label className="block text-sm">
        <span className="text-zinc-400">Description</span>
        <textarea
          name="description"
          rows={4}
          defaultValue={pg?.description ?? ''}
          className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-zinc-400">Contact phone</span>
          <input name="contactPhone" defaultValue={pg?.contactPhone ?? ''} className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Contact email</span>
          <input name="contactEmail" type="email" defaultValue={pg?.contactEmail ?? ''} className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100" />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm text-zinc-400">Gender policy</legend>
        <div className="mt-2 flex gap-4 text-sm text-zinc-200">
          {(['coed', 'male', 'female'] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="genderPolicy" value={v} defaultChecked={pg?.genderPolicy === v || (!pg && v === 'coed')} />
              {v}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm text-zinc-400">Features</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {AMENITY_KEYS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                name={`amenity_${key}`}
                defaultChecked={Boolean((pg?.amenities as Record<string, boolean>)?.[key])}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-2 text-sm text-zinc-400">Images (drag to reorder)</p>
        <ImageGalleryEditor
          initialImages={Array.isArray(pg?.images) ? pg.images : []}
          onUpload={handleUpload}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-200">
        <input type="checkbox" name="isActive" defaultChecked={pg?.isActive ?? true} />
        Accepting bookings (visible on /pgs)
      </label>

      <div className="flex flex-wrap gap-3">
        <motion.button
          type="submit"
          disabled={pending}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="rounded-lg bg-[#FF5A1F] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,90,31,0.35)] hover:brightness-110 disabled:opacity-60"
        >
          {pending ? 'Saving…' : mode === 'create' ? 'Create PG' : 'Save changes'}
        </motion.button>
      </div>
    </motion.form>
  );
}
