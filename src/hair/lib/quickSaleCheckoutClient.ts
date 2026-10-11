/** Client-side guard so Quick Sale never stays on Processing when the server action stalls. */
export const QUICK_SALE_CHECKOUT_CLIENT_TIMEOUT_MS = 90_000;

export function newQuickSaleCheckoutAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `qs_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function raceQuickSaleCheckout<T>(
  promise: Promise<T>,
  timeoutMs = QUICK_SALE_CHECKOUT_CLIENT_TIMEOUT_MS,
): Promise<{ kind: 'ok'; value: T } | { kind: 'timeout' }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('__qs_checkout_timeout__')), timeoutMs);
      }),
    ]);
    return { kind: 'ok', value };
  } catch (e) {
    if (e instanceof Error && e.message === '__qs_checkout_timeout__') {
      return { kind: 'timeout' };
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
