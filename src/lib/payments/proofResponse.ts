/** Build admin URL that streams payment proof images (works for data URLs and Cloudinary). */
export function adminPaymentProofViewUrl(
  kind: 'playstation' | 'rent' | 'electricity' | 'extension' | 'qr',
  id: string,
): string {
  return `/api/admin/payment-proof/${kind}/${id}`;
}

export function customerPaymentProofViewUrl(kind: 'playstation', id: string): string {
  return `/api/payment-proof/${kind}/${id}`;
}

/** Parse data: URIs or pass through https URLs into an HTTP image Response. */
export function proofUrlToImageResponse(url: string): Response {
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

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return Response.redirect(trimmed, 302);
  }

  return new Response('Unsupported proof URL', { status: 400 });
}

export function isDataProofUrl(url: string): boolean {
  return url.trim().startsWith('data:');
}
