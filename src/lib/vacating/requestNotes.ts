export type VacatingRequestNotesPayload = {
  roomPhotoUrl: string;
  meterPhotoUrl: string;
  residentNotes?: string;
};

export function encodeVacatingRequestNotes(payload: VacatingRequestNotesPayload): string {
  return JSON.stringify(payload);
}

export function parseVacatingRequestNotes(
  notes: string | null,
): VacatingRequestNotesPayload | null {
  if (!notes?.trim()) return null;
  try {
    const parsed = JSON.parse(notes) as Partial<VacatingRequestNotesPayload>;
    if (parsed.roomPhotoUrl && parsed.meterPhotoUrl) {
      return {
        roomPhotoUrl: parsed.roomPhotoUrl,
        meterPhotoUrl: parsed.meterPhotoUrl,
        residentNotes: parsed.residentNotes,
      };
    }
  } catch {
    return null;
  }
  return null;
}
