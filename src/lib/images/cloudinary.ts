/** Optional Cloudinary upload — requires server env vars. */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
      process.env.CLOUDINARY_API_KEY?.trim() &&
      process.env.CLOUDINARY_API_SECRET?.trim(),
  );
}

type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
};

async function signedCloudinaryUpload(args: {
  dataUri: string;
  resourceType: 'image' | 'video' | 'auto';
  folder?: string;
  publicId?: string;
}): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary is not configured on the server.');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = await import('node:crypto');
  const signParts = [`timestamp=${timestamp}`];
  if (args.folder) signParts.unshift(`folder=${args.folder}`);
  if (args.publicId) signParts.unshift(`public_id=${args.publicId}`);
  const toSign = `${signParts.join('&')}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const body = new FormData();
  body.append('file', args.dataUri);
  body.append('api_key', apiKey);
  body.append('timestamp', String(timestamp));
  body.append('signature', signature);
  if (args.folder) body.append('folder', args.folder);
  if (args.publicId) body.append('public_id', args.publicId);

  const endpoint =
    args.resourceType === 'video'
      ? `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`
      : `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  const res = await fetch(endpoint, { method: 'POST', body });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { secure_url?: string; public_id?: string };
  if (!json.secure_url || !json.public_id) {
    throw new Error('Cloudinary returned no URL.');
  }
  return { secureUrl: json.secure_url, publicId: json.public_id };
}

export async function uploadBufferToCloudinary(
  buffer: Buffer,
  mime: string,
  options: { folder: string; publicId: string },
): Promise<CloudinaryUploadResult> {
  const base64 = buffer.toString('base64');
  const dataUri = `data:${mime || 'image/jpeg'};base64,${base64}`;
  return signedCloudinaryUpload({
    dataUri,
    resourceType: 'image',
    folder: options.folder,
    publicId: options.publicId,
  });
}

export async function uploadToCloudinary(
  file: File,
  resourceType: 'image' | 'video' | 'auto' = 'image',
): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = buffer.toString('base64');
  const dataUri = `data:${file.type};base64,${base64}`;

  const result = await signedCloudinaryUpload({ dataUri, resourceType });
  return result.secureUrl;
}
