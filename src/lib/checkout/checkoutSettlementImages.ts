import { isDataProofUrl } from '@/src/lib/payments/proofResponse';
import {
  isBlobUrl,
  isPrivateBlobUrl,
  privateBlobReachable,
} from '@/src/lib/storage/blob';

export type CheckoutSettlementImageKind = 'meter' | 'refund_qr';

export type CheckoutSettlementImageEvidence = {
  /** Raw value stored in checkout_settlements (or legacy resident_requests). */
  storedUrl: string | null;
  /** Browser-safe URL — admin proxy route or inline data URL. */
  viewUrl: string | null;
  /** True when the image bytes can be fetched (server-verified or inline data). */
  fetchable: boolean;
  status: 'present' | 'missing' | 'image_missing' | 'alternative';
  statusLabel: string;
  failureReason: string | null;
};

export function adminCheckoutSettlementImageUrl(
  settlementId: string,
  kind: CheckoutSettlementImageKind,
): string {
  return `/api/admin/checkout-settlement/${settlementId}/image/${kind}`;
}

export function checkoutSettlementStoredUrlForKind(
  settlement: {
    electricityMeterPhotoUrl?: string | null;
    payoutQrUrl?: string | null;
  },
  kind: CheckoutSettlementImageKind,
): string | null {
  const raw =
    kind === 'meter' ? settlement.electricityMeterPhotoUrl : settlement.payoutQrUrl;
  const trimmed = raw?.trim();
  return trimmed || null;
}

async function storedCheckoutImageReachable(stored: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (isDataProofUrl(stored)) {
    const comma = stored.indexOf(',');
    if (comma === -1) return { ok: false, reason: 'Malformed data URL' };
    const payload = stored.slice(comma + 1);
    if (!payload) return { ok: false, reason: 'Empty image data' };
    return { ok: true };
  }

  if (isPrivateBlobUrl(stored)) {
    return privateBlobReachable(stored);
  }

  if (stored.startsWith('http://') || stored.startsWith('https://')) {
    if (isBlobUrl(stored)) {
      return { ok: false, reason: 'Public Blob URL must be served via admin proxy' };
    }
    try {
      const res = await fetch(stored, { method: 'HEAD', redirect: 'follow' });
      if (res.ok) return { ok: true };
      return { ok: false, reason: `HTTP ${res.status} from stored URL` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: msg.slice(0, 200) };
    }
  }

  return { ok: false, reason: 'Unsupported stored image URL' };
}

function viewUrlForStored(
  settlementId: string,
  kind: CheckoutSettlementImageKind,
  stored: string,
): string {
  if (isDataProofUrl(stored)) return stored;
  return adminCheckoutSettlementImageUrl(settlementId, kind);
}

export async function resolveCheckoutSettlementImageEvidence(input: {
  settlementId: string;
  kind: CheckoutSettlementImageKind;
  storedUrl: string | null | undefined;
  alternativePresent?: boolean;
  alternativeLabel?: string;
}): Promise<CheckoutSettlementImageEvidence> {
  const stored = input.storedUrl?.trim() || null;

  if (!stored) {
    if (input.alternativePresent) {
      return {
        storedUrl: null,
        viewUrl: null,
        fetchable: false,
        status: 'alternative',
        statusLabel: 'Present',
        failureReason: null,
      };
    }
    return {
      storedUrl: null,
      viewUrl: null,
      fetchable: false,
      status: 'missing',
      statusLabel: 'Missing',
      failureReason: null,
    };
  }

  const reachable = await storedCheckoutImageReachable(stored);
  if (!reachable.ok) {
    return {
      storedUrl: stored,
      viewUrl: null,
      fetchable: false,
      status: 'image_missing',
      statusLabel: 'Image missing',
      failureReason: reachable.reason ?? 'Image could not be fetched',
    };
  }

  return {
    storedUrl: stored,
    viewUrl: viewUrlForStored(input.settlementId, input.kind, stored),
    fetchable: true,
    status: 'present',
    statusLabel: 'Present',
    failureReason: null,
  };
}

export async function enrichCheckoutSettlementImageEvidence<
  T extends {
    id: string;
    electricityMeterPhotoUrl?: string | null;
    electricityUseAverage?: boolean | null;
    payoutQrUrl?: string | null;
    payoutUpiId?: string | null;
  },
>(detail: T): Promise<
  T & {
    meterPhotoEvidence: CheckoutSettlementImageEvidence;
    refundQrEvidence: CheckoutSettlementImageEvidence;
  }
> {
  const [meterPhotoEvidence, refundQrEvidence] = await Promise.all([
    resolveCheckoutSettlementImageEvidence({
      settlementId: detail.id,
      kind: 'meter',
      storedUrl: detail.electricityMeterPhotoUrl,
      alternativePresent: Boolean(detail.electricityUseAverage),
      alternativeLabel: 'Average billing selected',
    }),
    resolveCheckoutSettlementImageEvidence({
      settlementId: detail.id,
      kind: 'refund_qr',
      storedUrl: detail.payoutQrUrl,
      alternativePresent: Boolean(detail.payoutUpiId?.trim()),
      alternativeLabel: `UPI: ${detail.payoutUpiId?.trim()}`,
    }),
  ]);

  return { ...detail, meterPhotoEvidence, refundQrEvidence };
}
