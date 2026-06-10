/** Per-image upload cap (client + server). */
export const KYC_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Target size after client compression (keeps Server Action payload small). */
export const KYC_TARGET_BYTES = 2.5 * 1024 * 1024;

export const KYC_FILE_TOO_LARGE_MESSAGE =
  'Image is too large. Please upload a file smaller than 10 MB.';

export const KYC_AADHAAR_MAX_EDGE_PX = 2400;
export const KYC_SELFIE_MAX_EDGE_PX = 1600;

/** Matches server OCR minimums in kycValidation.ts. */
export const KYC_AADHAAR_MIN_WIDTH_PX = 480;
export const KYC_SELFIE_MIN_EDGE_PX = 240;

export type KycUploadKind = 'aadhaar' | 'selfie';

export function kycUploadKindForField(
  name: 'aadhaarFront' | 'aadhaarBack' | 'selfie',
): KycUploadKind {
  return name === 'selfie' ? 'selfie' : 'aadhaar';
}

export function validateKycUploadSize(bytes: number): string | null {
  if (bytes <= 0) return 'Choose an image to upload.';
  if (bytes > KYC_MAX_UPLOAD_BYTES) return KYC_FILE_TOO_LARGE_MESSAGE;
  return null;
}
