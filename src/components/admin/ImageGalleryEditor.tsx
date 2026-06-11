'use client';

import { Reorder, useDragControls } from 'framer-motion';
import { useState } from 'react';

type Props = {
  name?: string;
  initialImages: string[];
  onUpload?: (file: File) => Promise<string>;
};

function ReorderItem({
  url,
  onRemove,
}: {
  url: string;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={url}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 p-2"
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab px-1 text-xs text-zinc-500 active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-12 w-20 rounded object-cover" />
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">{url}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10"
      >
        Remove
      </button>
    </Reorder.Item>
  );
}

export function ImageGalleryEditor({ name = 'images', initialImages, onUpload }: Props) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    setImages((prev) => [...prev, url]);
    setUrlInput('');
  };

  const handleFile = async (file: File | null) => {
    if (!file || !onUpload) return;
    setUploading(true);
    setError(null);
    try {
      const url = await onUpload(file);
      setImages((prev) => [...prev, url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(images)} readOnly />

      <Reorder.Group axis="y" values={images} onReorder={setImages} className="space-y-2">
        {images.map((url) => (
          <ReorderItem
            key={url}
            url={url}
            onRemove={() => setImages((prev) => prev.filter((u) => u !== url))}
          />
        ))}
      </Reorder.Group>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://… image URL"
          className="apg-field-input flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
        <button
          type="button"
          onClick={addUrl}
          className="rounded-lg bg-[#FF5A1F] px-4 py-2 text-sm font-medium text-white hover:brightness-110"
        >
          Add URL
        </button>
      </div>

      {onUpload ? (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#FF5A1F]/40 bg-[#FF5A1F]/10 px-4 py-2 text-sm font-medium text-[#FF5A1F] hover:bg-[#FF5A1F]/20">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          {uploading ? 'Uploading photo…' : '+ Upload photo'}
        </label>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}
