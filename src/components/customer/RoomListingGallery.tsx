'use client';

import { isDirectVideoUrl } from '@/src/lib/roomWorld/roomMedia';

export function RoomListingGallery({
  images,
  videos,
}: {
  images: string[];
  videos: string[];
}) {
  const directVideos = videos.filter((url) => isDirectVideoUrl(url));
  const embedVideos = videos.filter((url) => !isDirectVideoUrl(url));

  if (images.length === 0 && videos.length === 0) return null;

  return (
    <section className="mt-6 space-y-4">
      {images.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-apg-orange">Photos</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-[4/3] w-full rounded-2xl border border-white/10 object-cover"
              />
            ))}
          </div>
        </div>
      ) : null}

      {videos.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-apg-orange">Videos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {directVideos.map((url) => (
              <video
                key={url}
                src={url}
                controls
                className="w-full rounded-2xl border border-white/10 bg-black/40"
              />
            ))}
            {embedVideos.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-2xl border border-white/10 apg-glass-light px-4 py-8 text-sm text-apg-silver hover:text-apg-orange"
              >
                Watch video
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
