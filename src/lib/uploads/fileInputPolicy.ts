/**
 * Platform policy for image/file pickers on mobile and desktop.
 *
 * NEVER set `capture` on `<input type="file">` — it forces camera-only on iOS/Android
 * and hides Photo Library, Gallery, Screenshots, and Files.
 */

/** iOS HEIC/HEIF + standard images; gallery and camera both remain available. */
export const IMAGE_UPLOAD_ACCEPT = 'image/*,.heic,.heif,.webp';

export const IMAGE_UPLOAD_HELPER_TEXT =
  'Choose from gallery, photos, screenshots, or take a new photo';

export type ImageFileInputDomProps = {
  type: 'file';
  accept: string;
  multiple?: boolean;
};

/** Build safe DOM props for image pickers — never includes capture. */
export function buildImageFileInputProps(options?: {
  accept?: string;
  multiple?: boolean;
}): ImageFileInputDomProps {
  return {
    type: 'file',
    accept: options?.accept ?? IMAGE_UPLOAD_ACCEPT,
    ...(options?.multiple ? { multiple: true } : {}),
  };
}

const FORBIDDEN_CAPTURE_RE = /\bcapture\s*=\s*["'{]/;
const RAW_FILE_INPUT_JSX_RE = /<input\b[^>]*\btype\s*=\s*["']file["']/gi;

/** Paths allowed to contain literal `<input type="file">` (none — use ImageFileInput). */
export const RAW_FILE_INPUT_ALLOWLIST = new Set<string>();

/** Returns violations when source contains raw `<input type="file">` JSX. */
export function findRawFileInputViolations(
  filePath: string,
  source: string,
): string[] {
  if (RAW_FILE_INPUT_ALLOWLIST.has(filePath)) return [];
  if (filePath.startsWith('tests/')) return [];

  const violations: string[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('/**') ||
      trimmed.startsWith('/*')
    ) {
      continue;
    }
    if (!RAW_FILE_INPUT_JSX_RE.test(line)) continue;
    RAW_FILE_INPUT_JSX_RE.lastIndex = 0;
    violations.push(`${filePath}:${i + 1}: raw file input — use ImageFileInput`);
  }
  return violations;
}

/** Returns violations when source contains capture= on or near file inputs. */
export function findCaptureAttributeViolations(
  filePath: string,
  source: string,
): string[] {
  const violations: string[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.includes('capture')) continue;
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
    if (FORBIDDEN_CAPTURE_RE.test(line)) {
      violations.push(`${filePath}:${i + 1}: ${line.trim()}`);
    }
  }
  return violations;
}

/** Fail if any app source file sets capture= (regression guard). */
export function scanSourcesForCaptureViolations(
  entries: Array<{ path: string; source: string }>,
): string[] {
  return entries.flatMap(({ path, source }) => findCaptureAttributeViolations(path, source));
}

/** Fail if any app source file uses raw file inputs instead of ImageFileInput. */
export function scanSourcesForRawFileInputViolations(
  entries: Array<{ path: string; source: string }>,
): string[] {
  return entries.flatMap(({ path, source }) => findRawFileInputViolations(path, source));
}
