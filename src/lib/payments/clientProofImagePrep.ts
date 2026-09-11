import {
  PROOF_MAX_EDGE_PX,
  PROOF_TARGET_BYTES,
  validateProofUploadFile,
} from '@/src/lib/payments/proofUploadLimits';

export type PreparedProofImage = {
  file: File;
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

export function scaledProofDimensions(
  width: number,
  height: number,
  maxEdge: number = PROOF_MAX_EDGE_PX,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality);
  });
  if (!blob) throw new Error('Could not prepare this image. Try another photo.');
  return blob;
}

function outputFileName(originalName: string, prefix: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || prefix;
  return `${base}.jpg`;
}

/**
 * Resize and re-encode meter / refund evidence photos in the browser before upload.
 * Preserves enough resolution to read a meter display; server Sharp re-validates.
 */
export async function prepareProofImageForUpload(file: File): Promise<PreparedProofImage> {
  const validationError = validateProofUploadFile(file);
  if (validationError) throw new Error(validationError);

  const loaded = await loadImage(file);

  try {
    const { width, height } = scaledProofDimensions(loaded.width, loaded.height);
    const needsResize = width !== loaded.width || height !== loaded.height;
    const canSkipReencode =
      !needsResize && file.type === 'image/jpeg' && file.size <= PROOF_TARGET_BYTES;

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

    let quality = 0.82;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > PROOF_TARGET_BYTES && quality > 0.5) {
      quality -= 0.06;
      blob = await canvasToJpegBlob(canvas, quality);
    }

    const out = new File([blob], outputFileName(file.name, 'evidence'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

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
