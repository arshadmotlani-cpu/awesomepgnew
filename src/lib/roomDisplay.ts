/** Customer-facing sharing + room type line. */
export function sharingLabelForDisplay(capacity: number, roomType: string): string {
  const generic = /^\d+\s*Sharing$/i.test(roomType.trim());
  if (generic) {
    return capacity === 1 ? 'Single room (1-sharing)' : `${capacity}-sharing room`;
  }
  return `${roomType} · ${capacity}-sharing`;
}
