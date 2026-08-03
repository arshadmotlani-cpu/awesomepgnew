import { IMPERSONATION_BLOCKED_MESSAGE } from '@/src/lib/auth/impersonationPolicy';
import { getActiveImpersonationContext } from '@/src/lib/auth/impersonation';

export type ImpersonationBlockResult = { blocked: true; message: string } | { blocked: false };

/** Block credential and session-management mutations while impersonating. */
export async function getImpersonationCredentialBlock(): Promise<ImpersonationBlockResult> {
  const ctx = await getActiveImpersonationContext();
  if (!ctx) return { blocked: false };
  return { blocked: true, message: IMPERSONATION_BLOCKED_MESSAGE };
}

export async function assertNotImpersonatingForCredentialChange(): Promise<void> {
  const block = await getImpersonationCredentialBlock();
  if (block.blocked) {
    throw new Error(block.message);
  }
}
