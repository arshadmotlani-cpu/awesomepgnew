/** Client-side signup API calls — hard timeout so UI never hangs indefinitely. */
export const SIGNUP_REQUEST_TIMEOUT_MS = 12_000;

export class SignupRequestTimeoutError extends Error {
  constructor() {
    super('Signup request timed out.');
    this.name = 'SignupRequestTimeoutError';
  }
}

export async function signupFetch(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = SIGNUP_REQUEST_TIMEOUT_MS, ...fetchInit } = init;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...fetchInit,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SignupRequestTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const SIGNUP_TIMEOUT_MESSAGE =
  'This is taking too long. Check your connection and tap Try again.';

export const SIGNUP_GENERIC_ERROR_MESSAGE =
  'We could not finish setting up your account. Please try again.';
