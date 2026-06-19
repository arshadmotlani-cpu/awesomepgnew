export type KycDocumentKind = 'aadhaar_front' | 'aadhaar_back' | 'selfie';

export const KYC_DOCUMENT_LABELS: Record<KycDocumentKind, string> = {
  aadhaar_front: 'Aadhaar front',
  aadhaar_back: 'Aadhaar back',
  selfie: 'Selfie',
};

export function kycDocumentUrl(submissionId: string, kind: KycDocumentKind): string {
  return `/api/kyc/documents/${submissionId}/${kind}`;
}

export function kycHasAadhaarImages(submission: {
  aadhaarFrontPath?: string | null;
  aadhaarBackPath?: string | null;
}): boolean {
  return Boolean(submission.aadhaarFrontPath?.trim() && submission.aadhaarBackPath?.trim());
}

export function adminAadhaarPdfUrl(kycId: string): string {
  return `/api/admin/kyc/${kycId}/aadhaar-pdf`;
}

export const ADMIN_AADHAAR_PDF_BULK_URL = '/api/admin/kyc/aadhaar-pdf-bulk';
