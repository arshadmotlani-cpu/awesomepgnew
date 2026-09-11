/** Per-image upload cap (client + server). */
export const PROOF_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Target size after client compression — keeps upload fast; server Sharp re-validates. */
export const PROOF_TARGET_BYTES = 400_000;

/** Matches server Sharp resize in proofImageProcessing.ts. */
export const PROOF_MAX_EDGE_PX = 1200;

export const PROOF_FILE_TOO_LARGE_MESSAGE =
  'Image is too large. Please upload a file smaller than 10 MB.';

export function validateProofUploadSize(bytes: number): string | null {
  if (bytes <= 0) return 'Choose an image to upload.';
  if (bytes > PROOF_MAX_UPLOAD_BYTES) return PROOF_FILE_TOO_LARGE_MESSAGE;
  return null;
}

export function validateProofUploadFile(file: File): string | null {
  const sizeError = validateProofUploadSize(file.size);
  if (sizeError) return sizeError;
  if (!file.type.startsWith('image/') && !/\.(heic|heif|webp)$/i.test(file.name)) {
    return 'Please choose a photo (JPEG, PNG, or similar).';
  }
  return null;
}
