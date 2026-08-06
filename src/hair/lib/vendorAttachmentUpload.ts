const ALLOWED_VENDOR_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function isAllowedVendorAttachmentMime(mime: string): boolean {
  return ALLOWED_VENDOR_ATTACHMENT_TYPES.has(mime.toLowerCase());
}

export function vendorAttachmentExtension(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}

export async function uploadVendorAttachment(
  file: File,
  folder: 'vendor-payments' | 'purchase-invoices',
  entityId: string,
): Promise<{ url: string; contentType: string }> {
  const mime = file.type || 'application/octet-stream';
  if (!isAllowedVendorAttachmentMime(mime)) {
    throw new Error('Only PDF and image files are allowed');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File must be 10 MB or smaller');
  }

  const { uploadPrivate, isBlobPrivateConfigured } = await import('@/src/lib/storage/blob');
  if (!isBlobPrivateConfigured()) {
    throw new Error('File storage is not configured');
  }

  const ext = vendorAttachmentExtension(mime);
  const pathname = `hair/${folder}/${entityId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await uploadPrivate(pathname, buffer, mime);
  return { url: stored.url, contentType: mime };
}
