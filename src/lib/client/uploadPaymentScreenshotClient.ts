'use client';

type UploadResponse = { ok: true; url: string } | { ok: false; message?: string };

/**
 * Upload a payment screenshot via API route — does not trigger Server Action RSC refresh.
 */
export async function uploadPaymentScreenshotClient(formData: FormData): Promise<string> {
  const res = await fetch('/api/customer/payment-screenshot', {
    method: 'POST',
    body: formData,
    credentials: 'same-origin',
  });

  let data: UploadResponse | null = null;
  try {
    data = (await res.json()) as UploadResponse;
  } catch {
    // Non-JSON error body
  }

  if (!res.ok || !data?.ok) {
    throw new Error(data && 'message' in data && data.message ? data.message : 'Upload failed.');
  }

  return data.url;
}
