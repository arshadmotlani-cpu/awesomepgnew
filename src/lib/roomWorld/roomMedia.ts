/** Map room-level gallery media with PG gallery fallback by stable index. */
export function resolveRoomMedia(args: {
  roomIndex: number;
  roomImages?: string[];
  roomVideos?: string[];
  pgImages: string[];
  pgVideos: string[];
}): {
  imageUrl: string | null;
  videoUrl: string | null;
  images: string[];
  videos: string[];
} {
  const roomImages = (args.roomImages ?? []).filter(Boolean);
  const roomVideos = (args.roomVideos ?? []).filter(Boolean);
  const { roomIndex, pgImages, pgVideos } = args;

  if (roomImages.length > 0 || roomVideos.length > 0) {
    return {
      imageUrl: roomImages[0] ?? null,
      videoUrl: roomVideos[0] ?? null,
      images: roomImages,
      videos: roomVideos,
    };
  }

  const imageUrl =
    pgImages.length > 0 ? (pgImages[roomIndex % pgImages.length] ?? null) : null;
  const videoUrl =
    pgVideos.length > 0 ? (pgVideos[roomIndex % pgVideos.length] ?? null) : null;
  return {
    imageUrl,
    videoUrl,
    images: imageUrl ? [imageUrl] : [],
    videos: videoUrl ? [videoUrl] : [],
  };
}

/** YouTube/Vimeo links are not direct video files — skip for <video> src. */
export function isDirectVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return false;
  if (lower.includes('vimeo.com')) return false;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower) || lower.includes('/pg/videos/') || lower.includes('/rooms/');
}
