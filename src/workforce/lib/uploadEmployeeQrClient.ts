/** Client-side QR upload so the file never rides a server-action POST (avoids Failed to fetch). */

export async function persistQrFileInFormData(
  formData: FormData,
): Promise<{ error?: string }> {
  const file = formData.get('qrCodeFile');
  if (!(file instanceof File) || file.size === 0) return {};
  if (!file.type.startsWith('image/')) {
    return { error: 'QR code must be an image file.' };
  }
  if (file.size > 800_000) {
    return { error: 'QR code image must be under 800KB.' };
  }

  const body = new FormData();
  body.set('file', file);

  let res: Response;
  try {
    res = await fetch('/fyh/api/staff/qr', { method: 'POST', body });
  } catch {
    return { error: 'Could not upload the QR image. Check your connection and try again.' };
  }

  const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !json?.url) {
    return {
      error: json?.error || 'Could not upload the QR image. Please try again.',
    };
  }

  formData.delete('qrCodeFile');
  formData.set('qrCodeStoredUrl', json.url);
  return {};
}
