import {
  KYC_AADHAAR_MAX_EDGE_PX,
  KYC_SELFIE_MAX_EDGE_PX,
  KYC_TARGET_BYTES,
  type KycUploadKind,
  validateKycUploadSize,
} from './uploadLimits';

export type PreparedKycImage = {
  file: File;
  /** True when the output differs from the original (resize and/or re-encode). */
  wasProcessed: boolean;
  originalBytes: number;
  outputBytes: number;
};

type LoadedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  dispose: () => void;
};

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(ctx, width, height) {
        ctx.drawImage(bitmap, 0, 0, width, height);
      },
      dispose() {
        bitmap.close();
      },
    };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read this image.'));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw(ctx, width, height) {
        ctx.drawImage(img, 0, 0, width, height);
      },
      dispose() {
        URL.revokeObjectURL(url);
      },
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function scaledDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  if (!blob) throw new Error('Could not prepare this image. Try another photo.');
  return blob;
}

function outputFileName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'kyc-photo';
  return `${base}.jpg`;
}

/**
 * Resize and re-encode KYC photos in the browser before Server Action upload.
 * Preserves enough resolution for Aadhaar OCR / selfie checks on the server.
 */
export async function prepareKycImageForUpload(
  file: File,
  kind: KycUploadKind,
): Promise<PreparedKycImage> {
  const sizeError = validateKycUploadSize(file.size);
  if (sizeError) throw new Error(sizeError);

  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a photo (JPEG, PNG, or similar).');
  }

  const maxEdge = kind === 'aadhaar' ? KYC_AADHAAR_MAX_EDGE_PX : KYC_SELFIE_MAX_EDGE_PX;
  const loaded = await loadImage(file);

  try {
    const { width, height } = scaledDimensions(loaded.width, loaded.height, maxEdge);
    const needsResize = width !== loaded.width || height !== loaded.height;
    const canSkipReencode =
      !needsResize &&
      file.type === 'image/jpeg' &&
      file.size <= KYC_TARGET_BYTES;

    if (canSkipReencode) {
      return {
        file,
        wasProcessed: false,
        originalBytes: file.size,
        outputBytes: file.size,
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare this image on your device.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    loaded.draw(ctx, width, height);

    let quality = 0.9;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > KYC_TARGET_BYTES && quality > 0.52) {
      quality -= 0.06;
      blob = await canvasToJpegBlob(canvas, quality);
    }

    const out = new File([blob], outputFileName(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    const finalSizeError = validateKycUploadSize(out.size);
    if (finalSizeError) throw new Error(finalSizeError);

    return {
      file: out,
      wasProcessed: true,
      originalBytes: file.size,
      outputBytes: out.size,
    };
  } finally {
    loaded.dispose();
  }
}
