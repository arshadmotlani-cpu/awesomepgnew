import { getPrivate, isPrivateBlobUrl } from '@/src/lib/storage/blob';

/** Build admin URL that streams payment proof images (Blob, data URLs, or legacy HTTPS). */
export function adminPaymentProofViewUrl(
  kind: 'playstation' | 'rent' | 'electricity' | 'extension' | 'qr',
  id: string,
): string {
  return `/api/admin/payment-proof/${kind}/${id}`;
}

export function customerPaymentProofViewUrl(
  kind: 'playstation' | 'booking',
  id: string,
): string {
  return `/api/payment-proof/${kind}/${id}`;
}

/** Parse data URIs, stream private Blob URLs, or redirect public HTTPS URLs. */
export async function proofUrlToImageResponse(url: string): Promise<Response> {
  const trimmed = url.trim();
  if (!trimmed) {
    return new Response('Empty proof URL', { status: 404 });
  }

  if (trimmed.startsWith('data:')) {
    const comma = trimmed.indexOf(',');
    if (comma === -1) {
      return new Response('Malformed data URL', { status: 400 });
    }
    const header = trimmed.slice(0, comma);
    const payload = trimmed.slice(comma + 1);
    const mimeMatch = /^data:([^;,]+)/.exec(header);
    const contentType = mimeMatch?.[1] ?? 'image/jpeg';
    const isBase64 = header.includes(';base64');
    const bytes = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');

    if (bytes.length === 0) {
      return new Response('Empty image data', { status: 404 });
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline; filename="payment-proof.jpg"',
      },
    });
  }

  if (isPrivateBlobUrl(trimmed)) {
    try {
      const { stream, contentType } = await getPrivate(trimmed);
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=3600',
          'Content-Disposition': 'inline; filename="payment-proof.jpg"',
        },
      });
    } catch {
      return new Response('Payment proof not found', { status: 404 });
    }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return Response.redirect(trimmed, 302);
  }

  return new Response('Unsupported proof URL', { status: 400 });
}

export function isDataProofUrl(url: string): boolean {
  return url.trim().startsWith('data:');
}
