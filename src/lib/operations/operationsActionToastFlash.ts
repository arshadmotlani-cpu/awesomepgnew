export const OPS_APPROVED_TOAST_KEY = 'apg:operations-approved-toast';

export function stashOperationsApprovedToast(message: string): void {
  try {
    sessionStorage.setItem(OPS_APPROVED_TOAST_KEY, message);
  } catch {
    // ignore storage failures
  }
}

export function consumeOperationsApprovedToast(): string | null {
  try {
    const message = sessionStorage.getItem(OPS_APPROVED_TOAST_KEY);
    if (message) sessionStorage.removeItem(OPS_APPROVED_TOAST_KEY);
    return message;
  } catch {
    return null;
  }
}
