/** Map PG-level gallery media onto rooms by stable index (no schema change). */
export function resolveRoomMedia(args: {
  roomIndex: number;
  pgImages: string[];
  pgVideos: string[];
}): { imageUrl: string | null; videoUrl: string | null } {
  const { roomIndex, pgImages, pgVideos } = args;
  const imageUrl =
    pgImages.length > 0 ? (pgImages[roomIndex % pgImages.length] ?? null) : null;
  const videoUrl =
    pgVideos.length > 0 ? (pgVideos[roomIndex % pgVideos.length] ?? null) : null;
  return { imageUrl, videoUrl };
}

/** YouTube/Vimeo links are not direct video files — skip for <video> src. */
export function isDirectVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return false;
  if (lower.includes('vimeo.com')) return false;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower) || lower.includes('/pg/videos/');
}
