/**
 * Shantinagar parity runner — entry point for release gate scripts.
 */

import { runShantinagarCertification } from '@/src/roomOs/certification/runCertification';
import type { CertificationScope } from '@/src/roomOs/certification/types';

export type RunShantinagarParityResult = Awaited<ReturnType<typeof runShantinagarCertification>>;

/** Read-only Shantinagar certification — resolves PG and runs shantinagar-v1 suite. */
export async function runShantinagarParity(
  input: Partial<CertificationScope> = {},
): Promise<RunShantinagarParityResult> {
  return runShantinagarCertification(input);
}
