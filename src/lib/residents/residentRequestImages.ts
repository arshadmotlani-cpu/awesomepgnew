export type ResidentRequestImageKind = 'meter' | 'refund_qr';

export function adminResidentRequestImageUrl(
  requestId: string,
  kind: ResidentRequestImageKind,
): string {
  return `/api/admin/resident-request/${requestId}/image/${kind}`;
}
