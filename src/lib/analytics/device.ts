import type { DeviceType } from './constants';

/** Lightweight user-agent classification — no external dependency. */
export function parseDeviceType(userAgent: string | null | undefined): DeviceType {
  if (!userAgent) return 'desktop';
  const ua = userAgent.toLowerCase();

  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/.test(ua)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}
