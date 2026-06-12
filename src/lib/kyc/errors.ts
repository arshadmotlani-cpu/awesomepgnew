export const KYC_UPLOAD_FAILED_MESSAGE =
  'KYC upload failed. Please try again or contact support.';

export class KycStorageError extends Error {
  readonly code: 'NOT_CONFIGURED' | 'UPLOAD_FAILED' | 'READ_FAILED';

  constructor(code: KycStorageError['code'], message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'KycStorageError';
    this.code = code;
  }
}

/** Hide SQL / driver errors from customers. */
export function kycCustomerErrorMessage(err: unknown): string {
  if (err instanceof KycStorageError && err.code === 'NOT_CONFIGURED') {
    return KYC_UPLOAD_FAILED_MESSAGE;
  }
  if (err instanceof Error && /too large|10 MB/i.test(err.message)) {
    return err.message;
  }
  if (err instanceof Error && /Only JPEG|Aadhaar|Selfie|Upload/i.test(err.message)) {
    return err.message;
  }
  return KYC_UPLOAD_FAILED_MESSAGE;
}
