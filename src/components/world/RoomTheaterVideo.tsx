'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { getRoomVisualSeed } from '@/src/lib/roomWorld/roomVisualSeed';
import { isDirectVideoUrl } from '@/src/lib/roomWorld/roomMedia';

type Props = {
  roomId: string;
  roomNumber: string;
  floorLabel: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

/** Poster/gradient immediately; swap to walkthrough video when ready — never blocks paint. */
export function RoomTheaterVideo({
  roomId,
  roomNumber,
  floorLabel,
  imageUrl,
  videoUrl,
}: Props) {
  const visual = getRoomVisualSeed(roomId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const directVideo = isDirectVideoUrl(videoUrl) ? videoUrl! : null;

  useEffect(() => {
    setVideoReady(false);
  }, [roomId, directVideo]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !directVideo) return;
    void el.play().catch(() => {
      /* autoplay blocked — poster stays visible */
    });
  }, [directVideo, roomId]);

  const showPoster = !videoReady;
  const hasPosterImage = Boolean(imageUrl);

  return (
    <div className="room-theater-media relative aspect-[16/10] w-full overflow-hidden bg-black sm:aspect-[16/9]">
      {showPoster && hasPosterImage ? (
        <Image
          key={`poster-${roomId}`}
          src={imageUrl!}
          alt={`Room ${roomNumber} walkthrough poster`}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 720px"
          className="object-cover"
        />
      ) : null}

      {showPoster && !hasPosterImage ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ background: visual.gradient }}
        >
          <div
            className="world-room-node-noise absolute inset-0"
            style={{ opacity: visual.noiseOpacity }}
            aria-hidden
          />
          <span className="relative z-10 text-4xl font-semibold tabular-nums text-white/90">
            {roomNumber}
          </span>
          <span className="relative z-10 mt-1 text-xs uppercase tracking-wider text-white/45">
            {floorLabel}
          </span>
        </div>
      ) : null}

      {directVideo ? (
        <video
          ref={videoRef}
          key={`video-${roomId}`}
          src={directVideo}
          poster={imageUrl ?? undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className={
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ' +
            (videoReady ? 'opacity-100' : 'pointer-events-none opacity-0')
          }
          onCanPlay={() => setVideoReady(true)}
          onLoadedData={() => setVideoReady(true)}
        />
      ) : null}
    </div>
  );
}
