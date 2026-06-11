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
import { VideoGalleryEditor } from '@/src/components/admin/VideoGalleryEditor';

const AMENITY_KEYS = [
  ['wifi', 'Wi-Fi'],
  ['food', 'Food / meals'],
  ['laundry', 'Laundry'],
  ['parking', 'Parking'],
  ['ac', 'AC rooms'],
  ['housekeeping', 'Housekeeping'],
  ['powerBackup', 'Power backup'],
  ['gym', 'Gym'],
  ['cctv', 'CCTV security'],
  ['geyser', 'Geyser / hot water'],
  ['waterPurifier', 'RO water'],
  ['lift', 'Lift / elevator'],
] as const;

type Props = {
  mode: 'create' | 'edit';
  pg?: Pg;
  cloudinaryUploadAction?: (formData: FormData) => Promise<string>;
  cloudinaryVideoUploadAction?: (formData: FormData) => Promise<string>;
  cloudinaryConfigured?: boolean;
};

const initial: PgFormState = { ok: false };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-4">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-zinc-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function PgAdminForm({
  mode,
  pg,
  cloudinaryUploadAction,
  cloudinaryVideoUploadAction,
  cloudinaryConfigured = false,
}: Props) {
  const action =
    mode === 'create'
      ? createPgAction
      : updatePgAction.bind(null, pg!.id);

  const [state, formAction, pending] = useActionState(action, initial);

  const handleImageUpload = cloudinaryUploadAction
    ? async (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return cloudinaryUploadAction(fd);
      }
    : undefined;

  const handleVideoUpload = cloudinaryVideoUploadAction
    ? async (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return cloudinaryVideoUploadAction(fd);
      }
    : undefined;

  const customAmenities = (pg?.amenities as { custom?: string[] })?.custom?.join(', ') ?? '';

  return (
    <motion.form
      action={formAction}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Section 1 — Public listing (does not include rent beds or electricity)
      </p>
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

      {!cloudinaryConfigured ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Photo/video file upload needs Cloudinary env vars on the server. You can still paste image and video URLs below, or add{' '}
          <code className="text-amber-100">CLOUDINARY_CLOUD_NAME</code>,{' '}
          <code className="text-amber-100">CLOUDINARY_API_KEY</code>, and{' '}
          <code className="text-amber-100">CLOUDINARY_API_SECRET</code> in Vercel.
        </p>
      ) : null}

      <Section title="Basic details" description="Name, address, and listing description shown on /pgs.">
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
            <span className="text-zinc-400">Slug (URL)</span>
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

        <label className="block text-sm">
          <span className="text-zinc-400">Address line 2</span>
          <input
            name="addressLine2"
            defaultValue={pg?.addressLine2 ?? ''}
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
            rows={5}
            placeholder="Describe the PG, neighbourhood, rules, and what makes it special…"
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
      </Section>

      <Section title="Facilities & amenities" description="Tick what this PG offers. Shown on the public listing.">
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

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
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

        <label className="mt-4 block text-sm">
          <span className="text-zinc-400">Other facilities (comma-separated)</span>
          <input
            name="customAmenities"
            defaultValue={customAmenities}
            placeholder="Study room, rooftop terrace, pet friendly"
            className="apg-field-input mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
          />
        </label>
      </Section>

      <Section title="Photos" description="Hero image is the first photo. Drag to reorder.">
        <ImageGalleryEditor
          initialImages={Array.isArray(pg?.images) ? pg.images : []}
          onUpload={handleImageUpload}
        />
        {!handleImageUpload ? (
          <p className="text-xs text-zinc-500">Use “Add URL” to paste image links, or configure Cloudinary for file upload.</p>
        ) : null}
      </Section>

      <Section title="Videos" description="Tour videos or YouTube links for this PG.">
        <VideoGalleryEditor
          initialVideos={Array.isArray(pg?.videos) ? pg.videos : []}
          onUpload={handleVideoUpload}
        />
      </Section>

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
