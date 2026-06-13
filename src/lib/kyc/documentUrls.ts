export type KycDocumentKind = 'aadhaar_front' | 'aadhaar_back' | 'selfie';

export const KYC_DOCUMENT_LABELS: Record<KycDocumentKind, string> = {
  aadhaar_front: 'Aadhaar front',
  aadhaar_back: 'Aadhaar back',
  selfie: 'Selfie',
};

export function kycDocumentUrl(submissionId: string, kind: KycDocumentKind): string {
  return `/api/kyc/documents/${submissionId}/${kind}`;
}
