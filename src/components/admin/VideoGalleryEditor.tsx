'use client';

import { useState } from 'react';

type Props = {
  name?: string;
  initialVideos: string[];
  onUpload?: (file: File) => Promise<string>;
};

export function VideoGalleryEditor({ name = 'videos', initialVideos, onUpload }: Props) {
  const [videos, setVideos] = useState<string[]>(initialVideos);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    setVideos((prev) => [...prev, url]);
    setUrlInput('');
  };

  async function onFile(file: File | null) {
    if (!file || !onUpload) return;
    setUploading(true);
    setError(null);
    try {
      const url = await onUpload(file);
      setVideos((prev) => [...prev, url]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(videos)} readOnly />

      {videos.length === 0 ? (
        <p className="text-sm text-zinc-500">No videos yet. Paste a YouTube/Vimeo link or upload a file.</p>
      ) : (
        <ul className="space-y-2">
          {videos.map((url) => (
            <li
              key={url}
              className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700/80 bg-zinc-900/60 p-2 text-xs text-zinc-400"
            >
              <span className="truncate font-mono">{url}</span>
              <button
                type="button"
                onClick={() => setVideos((prev) => prev.filter((u) => u !== url))}
                className="text-rose-400 hover:bg-rose-500/10 rounded px-2 py-1"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://… video or YouTube URL"
          className="apg-field-input flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        />
        <button
          type="button"
          onClick={addUrl}
          className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600"
        >
          Add URL
        </button>
      </div>

      {onUpload ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
          {uploading ? 'Uploading video…' : 'Upload video file'}
        </label>
      ) : (
        <p className="text-xs text-amber-400/90">
          File upload needs Cloudinary env vars — you can still paste video URLs above.
        </p>
      )}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}
