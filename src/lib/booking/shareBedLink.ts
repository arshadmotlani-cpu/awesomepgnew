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
 * Invoke the OS share sheet from the bed share popover "Share" row only.
 * Missing API returns fallback; user dismiss (AbortError) is not a fallback.
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
