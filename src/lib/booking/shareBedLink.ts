export type NativeSharePayload = {
  url: string;
  title: string;
  text: string;
};

export type NativeShareOutcome = 'shared' | 'cancelled' | 'fallback';

export function isShareCancel(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Prefer the OS share sheet. Missing API or a non-cancel failure falls back
 * to the small copy/WhatsApp popover. User dismiss is not a fallback.
 */
export async function requestNativeBedShare(
  payload: NativeSharePayload,
  share?: (data: NativeSharePayload) => Promise<void>,
): Promise<NativeShareOutcome> {
  if (!share) return 'fallback';
  try {
    await share(payload);
    return 'shared';
  } catch (err) {
    if (isShareCancel(err)) return 'cancelled';
    return 'fallback';
  }
}

export async function copyBedShareLink(
  url: string,
  writeText: (value: string) => Promise<void>,
): Promise<boolean> {
  try {
    await writeText(url);
    return true;
  } catch {
    return false;
  }
}
